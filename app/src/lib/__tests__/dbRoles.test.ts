import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { emptyStatBlock } from '@/lib/character/statblock';
import { emptyThreatSheet } from '@/lib/character/threatSheet';

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ session: null, sessions: {}, characters: [], relations: [], locations: [] });
});

describe('local fallback roles', () => {
  it('createSpace mints a gm session and stores the player hash', async () => {
    const s = await db.createSpace('Test', 'gm-pw', 'player-pw');
    expect(s.role).toBe('gm');
    expect(s.isAdmin).toBe(true);
  });

  it('joinSpace resolves gm / player / viewer by password', async () => {
    const created = await db.createSpace('Test', 'gm-pw', 'player-pw');
    const code = created.space.invite_code;
    expect((await db.joinSpace(code, 'gm-pw')).role).toBe('gm');
    expect((await db.joinSpace(code, 'player-pw')).role).toBe('player');
    await expect(db.joinSpace(code, '')).rejects.toThrow('WRONG_PASSWORD'); // public_read off
    useAppStore.setState({ session: created });
    await db.updateSpaceSettings('gm-pw', { public_read: true });
    expect((await db.joinSpace(code, '')).role).toBe('viewer');
    await expect(db.joinSpace(code, 'nope')).rejects.toThrow('WRONG_PASSWORD');
  });

  it('non-gm reads filter gm_only rows and strip gm_notes', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });
    const hidden = await db.createCharacter({
      space_id: gm.space.id, name: 'Secret', role: '', instinct: '', type: 'MENACE',
      notes: '', traits: [], tags: [], gm_only: true, dead: false, gm_notes: '<p>s</p>',
    });
    const visible = await db.createCharacter({
      space_id: gm.space.id, name: 'Public', role: '', instinct: '', type: 'PNJ',
      notes: '', traits: [], tags: [], gm_only: false, dead: false, gm_notes: '<p>npc</p>',
    });
    await db.createRelation({
      space_id: gm.space.id, from_character_id: hidden.id,
      to_character_id: visible.id, relation_type: 'ennemi', gm_only: false,
    });

    expect((await db.getSpaceCharacters(gm.space.id)).length).toBe(2);

    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    const chars = await db.getSpaceCharacters(gm.space.id);
    expect(chars.length).toBe(1);
    expect(chars[0].gm_notes ?? null).toBeNull();
    expect((await db.getSpaceRelations(gm.space.id)).length).toBe(0); // hidden endpoint
  });

  it('strips instinct/statblock/threat.instinct from plain NPCs for players, keeps kind/tags and the whole lot on followers and PJs', async () => {
    const gm = await db.createSpace('Secrets', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });
    const plain = await db.createCharacter({
      space_id: gm.space.id, name: 'Elios', role: 'farmer', type: 'PNJ',
      instinct: 'complain but get the job done', notes: '', traits: [],
      tags: ['the barrow', 'stealthy'],
      gm_only: false, dead: false,
      threat: { ...emptyThreatSheet(), instinct: 'legacy fallback' },
      statblock: emptyStatBlock(),
      kind: 'undead',
    });
    await db.createCharacter({
      space_id: gm.space.id, name: 'Andras', role: 'apprentice hunter', type: 'PNJ',
      instinct: 'try to impress Rhianna', notes: '', traits: [], tags: [], gm_only: false, dead: false,
      statblock: emptyStatBlock(), kind: 'npc',
      follower: { cost: 'recognition', loyalty: 1, leaderId: null },
    });
    await db.createCharacter({
      space_id: gm.space.id, name: 'Rhianna', role: 'Marshal', type: 'PJ',
      instinct: 'protect the village', notes: '', traits: [], tags: [], gm_only: false, dead: false,
    });

    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    const chars = await db.getSpaceCharacters(gm.space.id);
    const byName = new Map(chars.map((c) => [c.name, c]));

    expect(byName.get('Elios')!.instinct).toBe('');
    expect(byName.get('Elios')!.statblock ?? null).toBeNull();
    // La catégorie de bestiaire et les tags RESTENT : c'est de la description,
    // pas de la mécanique — ce qu'une table observe d'une créature qu'elle
    // voit. Une créature que le MJ n'a pas révélée est une ligne `gm_only`,
    // pas une ligne visible à la nature effacée. (Et côté client, c'est `kind`
    // qui décide si les tags s'affichent : le nuller cachait en silence les
    // tags d'un monstre qu'on était censé regarder.)
    expect(byName.get('Elios')!.kind).toBe('undead');
    expect(byName.get('Elios')!.tags).toEqual(['the barrow', 'stealthy']);
    expect(byName.get('Elios')!.threat?.instinct ?? '').toBe('');
    expect(byName.get('Andras')!.instinct).toBe('try to impress Rhianna');
    expect(byName.get('Andras')!.follower?.loyalty).toBe(1);
    expect(byName.get('Andras')!.kind).toBe('npc');
    expect(byName.get('Rhianna')!.instinct).toBe('protect the village');

    useAppStore.setState({ session: gm });
    const gmChars = await db.getSpaceCharacters(gm.space.id);
    const gmElios = gmChars.find((c) => c.name === 'Elios')!;
    expect(gmElios.instinct).toBe('complain but get the job done');
    expect(gmElios.statblock).not.toBeNull();
    expect(gmElios.kind).toBe('undead');
    expect(gmElios.threat?.instinct).toBe('legacy fallback');
    // `plain` referenced so the fixture reads clearly:
    expect(plain.name).toBe('Elios');
  });

  it('gm timeline strand is separate and hidden from players', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });
    await db.saveTimeline(gm.space.id, { entries: { '1': { spring: 'shared' } } });
    await db.saveGmTimeline(gm.space.id, { '1': { spring: 'secret' } });
    await db.saveTimeline(gm.space.id, { entries: { '1': { spring: 'shared v2' } } });
    expect((await db.getTimeline(gm.space.id))?.gm_entries).toEqual({ '1': { spring: 'secret' } });

    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    expect((await db.getTimeline(gm.space.id))?.gm_entries ?? null).toBeNull();
  });

  it('updateSessionSpace patches the active space without wiping loaded data', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    const character = {
      id: 'char-1', space_id: gm.space.id, name: 'Hero', role: '', instinct: '', type: 'PJ' as const,
      notes: '', traits: [], tags: [], gm_only: false, dead: false,
      created_at: '', updated_at: '',
    };
    useAppStore.setState({ session: gm, characters: [character] });

    useAppStore.getState().updateSessionSpace({ public_read: true });

    const { session, sessions, characters } = useAppStore.getState();
    expect(session?.space.public_read).toBe(true);
    expect(sessions[gm.space.id]?.space.public_read).toBe(true);
    expect(characters).toEqual([character]);
  });

  it('tone & content: every role reads, only player and gm write', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });
    await db.updateSpaceSettings('gm-pw', { public_read: true });
    await db.saveToneAndContent(gm.space.id, { notes: '<h2>Subject matter</h2>' });

    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    expect((await db.getToneAndContent(gm.space.id))?.notes).toContain('Subject matter');
    // The point of the record: a player can add a boundary without the GM.
    await db.saveToneAndContent(gm.space.id, { notes: '<p>no spiders</p>' });

    const viewer = await db.joinSpace(gm.space.invite_code, '');
    useAppStore.setState({ session: viewer });
    // A viewer still READS it — unlike the GM journal, which hides itself.
    expect((await db.getToneAndContent(gm.space.id))?.notes).toContain('no spiders');
    await expect(db.saveToneAndContent(gm.space.id, { notes: 'nope' })).rejects.toThrow();
  });
});

describe('gm journal role gating (local fallback)', () => {
  it('returns null to a player', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    expect(await db.getGmJournal(gm.space.id)).toBeNull();
  });

  it('rejects a player save', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    await expect(db.saveGmJournal(gm.space.id, { notes: '<p>x</p>' })).rejects.toThrow('FORBIDDEN');
  });

  it('merges by key presence: a notes save keeps wonders', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });
    const wonder = {
      id: 'w1', text: 'I wonder…', resolved: false, created_at: '2026-07-30T00:00:00Z',
    };
    await db.saveGmJournal(gm.space.id, { wonders: [wonder] });
    const after = await db.saveGmJournal(gm.space.id, { notes: '<p>hello</p>' });
    expect(after.wonders).toEqual([wonder]);
    expect(after.notes).toBe('<p>hello</p>');
    // Exercise the read path too, not just the save's return value.
    expect(await db.getGmJournal(gm.space.id)).toEqual(after);
  });
});
