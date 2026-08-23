import { describe, it, expect } from 'vitest';
import { promotedConfigFor, resolvePromotedRelations } from '../promotedRelations';
import type { Character, Relation } from '../../../types';

const char = (id: string, type: Character['type'], role = ''): Pick<Character, 'id' | 'type' | 'role'> =>
  ({ id, type, role });

const rel = (
  id: string, from: string, to: string, relation_type: string,
): Pick<Relation, 'id' | 'from_character_id' | 'to_character_id' | 'relation_type'> =>
  ({ id, from_character_id: from, to_character_id: to, relation_type });

describe('promotedConfigFor', () => {
  it('gives a clue leads-to, uncapped', () => {
    const c = promotedConfigFor('clue');
    expect(c.type).toBe('leads-to');
    expect(c.cap).toBe(Infinity);
    expect(c.outgoing).toBe(true);
  });

  it('gives an artifact and an arcanum held-by, capped at one', () => {
    for (const kind of ['artifact', 'arcanum']) {
      const c = promotedConfigFor(kind);
      expect(c.type).toBe('held-by');
      expect(c.cap).toBe(1);
    }
  });

  it('gives an encounter encounter-with', () => {
    expect(promotedConfigFor('encounter').type).toBe('encounter-with');
  });

  it('makes a revelation receive-only', () => {
    expect(promotedConfigFor('revelation').outgoing).toBe(false);
  });

  it('falls back to leads-to for an unfiled or unknown role', () => {
    expect(promotedConfigFor('').type).toBe('leads-to');
    expect(promotedConfigFor(undefined).type).toBe('leads-to');
    expect(promotedConfigFor('Blessed · Initiate').type).toBe('leads-to');
  });
});

describe('resolvePromotedRelations', () => {
  it('promotes a clue -> revelation lead and shows it from both ends', () => {
    const chars = [char('clue1', 'DISCOVERY', 'clue'), char('rev1', 'DISCOVERY', 'revelation')];
    const rels = [rel('r1', 'clue1', 'rev1', 'leads-to')];
    const out = resolvePromotedRelations(chars, rels);

    expect(out.outgoing.get('clue1')?.[0].otherIds).toEqual(['rev1']);
    expect(out.outgoing.get('clue1')?.[0].config.type).toBe('leads-to');
    expect(out.incoming.get('rev1')?.[0].otherIds).toEqual(['clue1']);
    expect(out.promotedRelationIds.has('r1')).toBe(true);
    // INCIDENTAL, not the receive-only guard: rev1 has no outgoing relation in
    // this fixture, so this would pass with `!config.outgoing` deleted. What
    // it does pin is the absence of REVERSE leakage — one row must not also
    // land on the far end's outgoing map. The real guard is the last test in
    // this describe ("leaves a leads-to stored FROM a revelation inert");
    // if these two are ever consolidated, keep that one.
    expect(out.outgoing.get('rev1')).toBeUndefined();
    expect(out.incoming.has('clue1')).toBe(false);
  });

  it('promotes an artifact held-by, and shows "Possesses" on the holder', () => {
    const chars = [char('art', 'DISCOVERY', 'artifact'), char('npc', 'PNJ')];
    const out = resolvePromotedRelations(chars, [rel('r1', 'art', 'npc', 'held-by')]);
    expect(out.outgoing.get('art')?.[0].otherIds).toEqual(['npc']);
    expect(out.incoming.get('npc')?.[0].config.type).toBe('held-by');
  });

  it('leaves an artifact leads-to inert — its promoted slot is held-by', () => {
    const chars = [char('art', 'DISCOVERY', 'artifact'), char('npc', 'PNJ')];
    const out = resolvePromotedRelations(chars, [rel('r1', 'art', 'npc', 'leads-to')]);
    expect(out.outgoing.size).toBe(0);
    expect(out.promotedRelationIds.size).toBe(0);
  });

  it('leaves a promoted type inert when the from end is not a DISCOVERY', () => {
    const chars = [char('npc', 'PNJ'), char('rev', 'DISCOVERY', 'revelation')];
    const out = resolvePromotedRelations(chars, [rel('r1', 'npc', 'rev', 'leads-to')]);
    expect(out.outgoing.size).toBe(0);
    expect(out.incoming.size).toBe(0);
    expect(out.promotedRelationIds.size).toBe(0);
  });

  it('ignores a relation type no kind promotes', () => {
    // Same guard as the artifact case above, from the other side: the type is
    // one nothing promotes rather than one the wrong kind promotes. Ported
    // from discoveryLeads.test.ts, which pinned it as "ignores other relation
    // types".
    const chars = [char('clue1', 'DISCOVERY', 'clue'), char('npc', 'PNJ')];
    const out = resolvePromotedRelations(chars, [rel('r1', 'clue1', 'npc', 'concerns')]);
    expect(out.outgoing.size).toBe(0);
    expect(out.incoming.size).toBe(0);
    expect(out.promotedRelationIds.size).toBe(0);
  });

  it('leaves a dangling relation inert', () => {
    const chars = [char('clue1', 'DISCOVERY', 'clue')];
    const out = resolvePromotedRelations(chars, [rel('r1', 'clue1', 'ghost', 'leads-to')]);
    expect(out.promotedRelationIds.size).toBe(0);
  });

  it('dedupes two relations on one pair but records BOTH relation ids', () => {
    const chars = [char('clue1', 'DISCOVERY', 'clue'), char('rev1', 'DISCOVERY', 'revelation')];
    const out = resolvePromotedRelations(chars, [
      rel('r1', 'clue1', 'rev1', 'leads-to'),
      rel('r2', 'clue1', 'rev1', 'leads-to'),
    ]);
    expect(out.outgoing.get('clue1')?.[0].otherIds).toEqual(['rev1']);
    // Both must be excluded from the bonds list, or the duplicate reappears there.
    expect([...out.promotedRelationIds]).toEqual(['r1', 'r2']);
  });

  it('groups a target that receives from two different kinds', () => {
    const chars = [
      char('clue1', 'DISCOVERY', 'clue'),
      char('enc1', 'DISCOVERY', 'encounter'),
      char('npc', 'PNJ'),
    ];
    const out = resolvePromotedRelations(chars, [
      rel('r1', 'clue1', 'npc', 'leads-to'),
      rel('r2', 'enc1', 'npc', 'encounter-with'),
    ]);
    const types = out.incoming.get('npc')!.map((g) => g.config.type);
    expect(types).toEqual(['leads-to', 'encounter-with']);
  });

  it('renders two held-by rows when two are stored — the cap is UI-only', () => {
    const chars = [char('art', 'DISCOVERY', 'artifact'), char('a', 'PNJ'), char('b', 'PNJ')];
    const out = resolvePromotedRelations(chars, [
      rel('r1', 'art', 'a', 'held-by'),
      rel('r2', 'art', 'b', 'held-by'),
    ]);
    expect(out.outgoing.get('art')?.[0].otherIds).toEqual(['a', 'b']);
  });

  it('keeps a clue and a site apart on a shared target even though both promote leads-to', () => {
    // Deliberately the SAME relation type from two different kinds — unlike
    // the "two different kinds" case above, which uses two different types
    // and therefore never exercises grouping-by-heading. A clue's leads-to
    // reads "Clues pointing here"; a site's reads "What leads here" — if
    // groups were keyed on `config.type` instead of the heading, these would
    // collapse into one, and the site would render mislabeled as a clue.
    const chars = [
      char('clue1', 'DISCOVERY', 'clue'),
      char('site1', 'DISCOVERY', 'site'),
      char('npc', 'PNJ'),
    ];
    const out = resolvePromotedRelations(chars, [
      rel('r1', 'clue1', 'npc', 'leads-to'),
      rel('r2', 'site1', 'npc', 'leads-to'),
    ]);
    const groups = out.incoming.get('npc')!;
    expect(groups).toHaveLength(2);
    const byKey = new Map(groups.map((g) => [g.groupKey, g.otherIds]));
    expect(byKey.get('character.cluesHere')).toEqual(['clue1']);
    expect(byKey.get('character.leadsHere')).toEqual(['site1']);
  });

  it('leaves a leads-to stored FROM a revelation inert — a revelation is receive-only', () => {
    // The existing "receive-only" assertion (outgoing.get('rev1') is
    // undefined) is vacuous when rev1 never has an outgoing relation in the
    // fixture. This one gives it one, so it actually exercises the
    // `!config.outgoing` guard: delete that guard and this test fails.
    const chars = [char('rev1', 'DISCOVERY', 'revelation'), char('npc', 'PNJ')];
    const out = resolvePromotedRelations(chars, [rel('r1', 'rev1', 'npc', 'leads-to')]);
    expect(out.outgoing.size).toBe(0);
    expect(out.promotedRelationIds.size).toBe(0);
  });
});
