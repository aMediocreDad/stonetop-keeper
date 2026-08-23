import { describe, expect, it } from 'vitest';
import type { Character, DiscoveryBlock } from '../../../../types';
import type { RawCampaignData } from '../../types';
import { writeVault, type VaultMeta } from '../write';
import { readVault } from '../read';
import { writeCharacter, parseCharacter } from '../entities/character';
import { normalizeDiscovery } from '../../../character/discoveryBlock';
import type { VaultContext } from '../context';
import { FIXTURE, arcanumFixture, clueFixture } from './fixture';

/**
 * The whole-vault contract. `parse(write(raw))` must give the rows back, and
 * writing twice must be byte-identical — that second property is what makes
 * "edit it in Obsidian and re-import" safe, because it proves the format has no
 * hidden ordering or formatting drift.
 */

const META: VaultMeta = {
  formatVersion: 1,
  exportedAt: '2026-08-06T18:22:04Z',
  appVersion: '0.3.0',
  space: { id: 's1', name: 'Example Campaign' },
  role: 'gm',
};

/** The documented exclusions. Stated here rather than hidden, so the assertion
 *  says exactly what the format does and does not promise. */
function stripExclusions(raw: RawCampaignData): RawCampaignData {
  return {
    ...raw,
    characters: raw.characters.map((c) => ({ ...c, space_id: '' })),
    locations: raw.locations.map((l) => ({ ...l, space_id: '' })),
    relations: raw.relations.map((r) => ({ ...r, space_id: '' })),
    maps: (raw.maps ?? []).map((m) => ({ ...m, space_id: '', thumb: null })),
    // Pin timestamps are excluded: the pin table is meant to be read at the
    // table, and two ISO columns per row would double its width.
    mapPins: (raw.mapPins ?? []).map((p) => ({ ...p, space_id: '', created_at: '', updated_at: '' })),
    gmJournal: raw.gmJournal ? { ...raw.gmJournal, space_id: '' } : null,
    toneAndContent: raw.toneAndContent ? { ...raw.toneAndContent, space_id: '' } : null,
    // current_year/current_season survive — via the manifest, not a year note.
    timeline: raw.timeline
      ? { ...raw.timeline, id: '', space_id: '', updated_at: '' }
      : null,
  };
}

describe('whole-vault round trip', () => {
  it('gives every row back', () => {
    const { raw } = readVault(writeVault(FIXTURE, META));
    expect(raw).toEqual(stripExclusions(FIXTURE));
  });

  it('is byte-idempotent end to end', () => {
    const once = writeVault(FIXTURE, META);
    const twice = writeVault(readVault(once).raw, META);
    expect(twice).toEqual(once);
  });

  it('reads the manifest back, including the role the export was taken at', () => {
    const { meta } = readVault(writeVault(FIXTURE, META));
    expect(meta).toMatchObject({ role: 'gm', space: { name: 'Example Campaign' } });
  });

  it('lays the vault out the way the README describes', () => {
    const paths = writeVault(FIXTURE, META).map((f) => f.path).sort();
    expect(paths).toContain('Characters/Ana.md');
    expect(paths).toContain('Locations/Stonetop.md');
    expect(paths).toContain('Chronicle/0847.md');
    expect(paths).toContain('Chronicle/0847 (GM).md');
    expect(paths).toContain('Maps/The Marsh.md');
    expect(paths).toContain('Relations.md');
    expect(paths).toContain('GM/Journal.md');
    expect(paths).toContain('Tone & content.md');
    expect(paths).toContain('ink-and-stone.yaml');
    expect(paths).toContain('README.md');
    expect(paths).toContain('Views/Cast.base');
  });

  it('appends a generated relations section that reading ignores', () => {
    const ana = writeVault(FIXTURE, META).find((f) => f.path === 'Characters/Ana.md');
    expect(String(ana?.content)).toContain('Generated from `Relations.md`');
    // Ignored on the way back: the relation is read once, from Relations.md.
    // (2 relations in FIXTURE: the enemy bond and the discovery's lead.)
    expect(readVault(writeVault(FIXTURE, META)).raw.relations).toHaveLength(2);
  });

  it('survives a vault with no manifest', () => {
    const files = writeVault(FIXTURE, META).filter((f) => f.path !== 'ink-and-stone.yaml');
    const { meta, raw } = readVault(files);
    expect(meta).toBeNull();
    // c1, c2, and the discovery d1.
    expect(raw.characters).toHaveLength(3);
  });

  it('skips one malformed note rather than failing the whole vault', () => {
    const files = [
      ...writeVault(FIXTURE, META),
      { path: 'Characters/Broken.md', content: '---\n: : :\n---\nnonsense' },
    ];
    const { raw } = readVault(files);
    expect(raw.characters.length).toBeGreaterThanOrEqual(2);
  });

  // Regression, found by running the real campaign through this: a season
  // holding `<p></p>` is non-empty as a string and empty as text. The writer
  // skipped it (right) while the manifest counted it (wrong), so the file
  // claimed 24 seasons for a vault holding 22.
  it('counts seasons by the same emptiness rule the writer skips on', () => {
    const withBlank: RawCampaignData = {
      ...FIXTURE,
      timeline: {
        ...FIXTURE.timeline!,
        entries: {
          ...FIXTURE.timeline!.entries,
          '848': { spring: { title: '', body: '<p></p>' } },
        },
      },
    };
    const files = writeVault(withBlank, META);
    const manifest = String(files.find((f) => f.path === 'ink-and-stone.yaml')?.content);
    const chronicleNotes = files.filter((f) => f.path.startsWith('Chronicle/'));
    // The blank year produced no note, so it must not be in the count either.
    expect(manifest).toContain('seasons: 2');
    expect(chronicleNotes).toHaveLength(2);
  });

  it('ignores files it does not recognise', () => {
    const files = [...writeVault(FIXTURE, META), { path: 'Attachments/notes.txt', content: 'hi' }];
    expect(readVault(files).raw.characters).toHaveLength(3);
  });

  it('keeps the invite code out of the manifest', () => {
    // The README tells you to hand this folder around, and on a public-read
    // space the code alone is a way in.
    const manifest = String(
      writeVault(FIXTURE, META).find((f) => f.path === 'ink-and-stone.yaml')?.content,
    );
    expect(manifest).not.toContain('invite_code');
    expect(manifest).toContain('id: s1');
    // Named in the exclusions instead, so the omission is discoverable.
    expect(manifest).toContain("invite code and password");
  });

  // Obsidian resolves `[[Name]]` across the WHOLE vault, so a map sharing a name
  // with a sheet would make every link to either one ambiguous.
  it('separates a map and a location that share a name', () => {
    const clash: RawCampaignData = {
      ...FIXTURE,
      maps: [{ ...FIXTURE.maps![0], name: 'Stonetop' }],
    };
    const paths = writeVault(clash, META).map((f) => f.path);
    expect(paths).toContain('Locations/Stonetop.md');
    expect(paths).not.toContain('Maps/Stonetop.md');
    expect(paths.some((p) => p.startsWith('Maps/Stonetop ('))).toBe(true);
  });

  it('exports tone & content even without the GM layer', () => {
    const playerRaw = { ...FIXTURE, gmJournal: null };
    const paths = writeVault(playerRaw, META).map((f) => f.path);
    expect(paths).toContain('Tone & content.md');
    expect(paths).not.toContain('GM/Journal.md');
  });

  it('gives two maps with the same name two images', () => {
    const twins: RawCampaignData = {
      ...FIXTURE,
      maps: [
        { ...FIXTURE.maps![0], id: 'm1', name: 'The Marsh' },
        { ...FIXTURE.maps![0], id: 'm2', name: 'The Marsh' },
      ],
    };
    const images = new Map([
      ['m1', { bytes: new Uint8Array([1]), ext: 'jpg' }],
      ['m2', { bytes: new Uint8Array([2]), ext: 'jpg' }],
    ]);
    const imagePaths = writeVault(twins, META, images)
      .filter((f) => f.path.startsWith('Maps/images/'))
      .map((f) => f.path);
    expect(imagePaths).toHaveLength(2);
    expect(new Set(imagePaths).size).toBe(2);
  });
});

describe('discovery notes', () => {
  it('lands in its own folder', () => {
    const files = writeVault(FIXTURE, META);
    expect(files.some((f) => f.path === 'Discoveries/The bronze plate.md')).toBe(true);
    expect(files.some((f) => f.path === 'Characters/The bronze plate.md')).toBe(false);
  });

  it('writes requirements as a task list', () => {
    const note = writeVault(FIXTURE, META).find((f) => f.path.startsWith('Discoveries/'))!;
    const md = String(note.content);
    expect(md).toContain('## Requirements');
    expect(md).toContain('- [x] dig it up & clean the plate');
    expect(md).toContain('- [ ] decipher the Maker-runes');
  });

  it('segments leads from bonds in the generated block', () => {
    const note = writeVault(FIXTURE, META).find((f) => f.path.startsWith('Discoveries/'))!;
    const md = String(note.content);
    expect(md).toContain('### Leads');
    expect(md.indexOf('### Leads')).toBeGreaterThan(md.indexOf('## Relations'));
  });

  it("segments c2's incoming lead from its ordinary bond, not just its outgoing one", () => {
    // d1 has only a lead (no bonds), so the case above can't tell a real
    // Leads/Bonds split from a resolver that dumped everything into Leads.
    // c2 is the one note with BOTH: the incoming `leads-to` from d1, and the
    // `ennemi` bond to c1 — so this is the note that actually exercises the
    // validity filter `resolvePromotedRelations` provides.
    const note = writeVault(FIXTURE, META).find((f) => f.path === 'Characters/The Drowned.md')!;
    const md = String(note.content);
    const leadsAt = md.indexOf('### Leads');
    const bondsAt = md.indexOf('### Bonds');
    expect(leadsAt).toBeGreaterThan(-1);
    expect(bondsAt).toBeGreaterThan(-1);
    const leadLineAt = md.indexOf('leads to');
    const bondLineAt = md.indexOf('enemy');
    expect(leadLineAt).toBeGreaterThan(-1);
    expect(bondLineAt).toBeGreaterThan(-1);
    // The lead line sits after ### Leads and before ### Bonds.
    expect(leadLineAt).toBeGreaterThan(leadsAt);
    expect(leadLineAt).toBeLessThan(bondsAt);
    // The bond line sits after ### Bonds, not under ### Leads.
    expect(bondLineAt).toBeGreaterThan(bondsAt);
    expect(bondLineAt).toBeGreaterThan(leadsAt);
  });

  it('indexes discoveries for wikilink resolution, not only for parsing', () => {
    // The name→id pass runs BEFORE any note is parsed; a discovery missing
    // from it makes every [[…]] pointing at it resolve to nothing on import.
    const { raw } = readVault(writeVault(FIXTURE, META));
    const lead = raw.relations.find((r) => r.relation_type === 'leads-to');
    expect(lead?.from_character_id).toBe('d1');
    expect(lead?.to_character_id).toBe('c2');
  });

  it('still reads a discovery whose requirements are under the old Traits heading', () => {
    // Backward tolerance: `Requirements` is what a discovery exports as NOW,
    // but an older export (or a heading a GM renamed by hand in Obsidian)
    // still says `Traits`. `parseCharacter` must fall back rather than branch
    // on `data.type`, so this exact note shape must keep working.
    const note = writeVault(FIXTURE, META).find((f) => f.path.startsWith('Discoveries/'))!;
    const legacy = String(note.content).replace('## Requirements', '## Traits');
    const { raw } = readVault([{ path: note.path, content: legacy }]);
    expect(raw.characters).toHaveLength(1);
    expect(raw.characters[0].traits).toEqual([
      { label: 'dig it up & clean the plate', checked: true },
      { label: 'decipher the Maker-runes', checked: false },
    ]);
  });
});

describe('discovery block export', () => {
  const ctx: VaultContext = { nameById: new Map(), idByName: new Map() };

  it('puts the scalars in frontmatter', () => {
    const md = writeCharacter(arcanumFixture, ctx);
    expect(md).toContain('tier: minor');
    expect(md).toContain('interesting: a maker sigil');
    expect(md).toContain('useful: the device is nearby');
  });

  it('writes each move as a sub-heading with its tags line', () => {
    const md = writeCharacter(arcanumFixture, ctx);
    expect(md).toContain('## Moves');
    expect(md).toContain('### Inflame');
    expect(md).toContain('(near, magical)');
    expect(md).toContain('When you wield the Scepter');
  });

  it("keeps a move body's option lines as Markdown bullets, untouched", () => {
    const md = writeCharacter(arcanumFixture, ctx);
    // The body is plain text with `- ` lines — already Markdown, so it must
    // pass through with no escaping.
    expect(md).toContain('\n- Act as you suggest');
  });

  it('writes consequences as a task list', () => {
    const md = writeCharacter(arcanumFixture, ctx);
    expect(md).toContain('## Consequences');
    expect(md).toContain('- [ ] Your skin becomes feverish');
  });

  it('writes a track as marked-of-max', () => {
    const md = writeCharacter(arcanumFixture, ctx);
    expect(md).toContain('Charges: 2/3');
  });

  it('omits every section for a discovery with no card of its own', () => {
    // `clueFixture` (d1) still carries a PARTIAL block — the GM-held
    // interesting/useful pair, no tier, no moves — so this also proves a
    // partial block only emits the parts that are actually set.
    const md = writeCharacter(clueFixture, ctx);
    expect(md).not.toContain('## Moves');
    expect(md).not.toContain('tier:');
  });

  it('never lands the column in x_unmapped', () => {
    const md = writeCharacter(arcanumFixture, ctx);
    expect(md).not.toContain('x_unmapped');
  });

  it('round-trips a track whose label is empty, which the writer can produce', () => {
    // normalizeTrack permits `label: ''` (an MCP write or a restored revision
    // makes one), the writer emits it as `: 2/3`, and a reader demanding a
    // non-empty label dropped the track and its marked pips silently.
    const withTrack = {
      ...arcanumFixture,
      discovery: { ...arcanumFixture.discovery, tracks: [{ label: '', max: 3, marked: 2 }] },
    };
    const back = parseCharacter(writeCharacter(withTrack, ctx), ctx);
    expect(back.discovery?.tracks).toEqual([{ label: '', max: 3, marked: 2 }]);
  });

  it('round-trips a full discovery block byte for byte', () => {
    // No reader for `discovery` is listed anywhere else in the task plan, so
    // this is the contract that keeps a re-imported vault from losing the
    // block silently — the round-trip guarantee every other JSONB block on
    // this note already gets (see `character.test.ts`'s MAXIMAL fixture).
    const back = parseCharacter(writeCharacter(arcanumFixture, ctx), ctx);
    expect(back.discovery).toEqual(arcanumFixture.discovery);
  });

  it('round-trips the partial block too, with the missing keys simply absent', () => {
    const back = parseCharacter(writeCharacter(clueFixture, ctx), ctx);
    expect(back.discovery).toEqual(clueFixture.discovery);
  });

  // Fix round 1: `MovesEditor.tsx` appends a freshly added move as
  // `{name: '', text: ''}` at the END of the array, so "an unnamed move
  // AFTER a named one" is the default shape of every card with more than one
  // move, not a rare edge case. Before this fix the two moves' bodies
  // silently concatenated into a single entry on export — `write(read(write))`
  // stayed byte-stable straight through the corruption, so no idempotence
  // test could ever have caught it.
  it('keeps a named move and a later unnamed move as two separate entries', () => {
    const c: Character = {
      ...clueFixture,
      traits: [],
      discovery: {
        moves: [
          { name: 'Inflame', text: 'A' },
          { name: '', text: 'B' },
        ],
      },
    };
    const back = parseCharacter(writeCharacter(c, ctx), ctx);
    expect(back.discovery?.moves).toEqual([
      { name: 'Inflame', text: 'A' },
      { name: '', text: 'B' },
    ]);
  });

  // FINAL REVIEW, finding 2. An unnamed move's tags used to leave through the
  // export and never come back: `writeMoves` gates the `(tags)` parenthetical
  // on the move having a name, while nothing on the read side did. No
  // idempotence test could catch it — `write(read(write(x)))` was byte-stable
  // straight through the loss, exactly like the unnamed-move corruption above.
  // The rule now lives at the single read boundary the WRITER normalises
  // through too, so what the vault gives back IS the normalised block.
  it('agrees with the read boundary about an unnamed move that carries tags', () => {
    const c: Character = {
      ...clueFixture,
      traits: [],
      discovery: {
        moves: [
          { name: 'Inflame', text: 'A', tags: 'near' },
          { name: '', text: 'B', tags: '2 charges' },
        ],
      },
    };
    const back = parseCharacter(writeCharacter(c, ctx), ctx);
    expect(back.discovery).toEqual(normalizeDiscovery(c.discovery));
    // Spelled out rather than left to the equality above, which would also
    // hold if BOTH ends started inventing a `(tags)` move name.
    expect(back.discovery?.moves).toEqual([
      { name: 'Inflame', text: 'A', tags: 'near' },
      { name: '', text: 'B' },
    ]);
  });

  // Fix round 1: unticking `- [x] gained` to `- [ ] gained` is the ordinary
  // Obsidian interaction with this format. `gained` must clear, AND the
  // checklist line must not stay glued to `text` forever.
  it('clears a hand-unticked gained mark without leaving the checklist line in the text', () => {
    const c: Character = {
      ...clueFixture,
      traits: [],
      discovery: { moves: [{ name: 'Ward', text: 'Shrug off a blow.', gained: true }] },
    };
    const unticked = writeCharacter(c, ctx).replace('- [x] gained', '- [ ] gained');
    const back = parseCharacter(unticked, ctx);
    expect(back.discovery?.moves?.[0]).toEqual({ name: 'Ward', text: 'Shrug off a blow.' });
  });

  it('gives a blockless discovery `discovery: null` back, not an empty object', () => {
    const blockless: Character = { ...clueFixture, discovery: null };
    const back = parseCharacter(writeCharacter(blockless, ctx), ctx);
    expect(back.discovery).toBeNull();
  });

  // `KNOWN_TITLES` is load-bearing: any heading the writer emits must be
  // listed there, or `bodyWithStrays` treats a hand-typed heading right after
  // it as an unknown continuation of the PRECEDING prose field and dumps it
  // in there instead. Traits/Requirements is emptied out in each case below
  // so the new heading sits directly after `## Notes` — the one spot in this
  // note where that absorption can actually happen (`GM Notes` is always
  // last, so nothing ever follows it).
  it.each([
    ['Moves', { moves: [{ name: 'Inflame', text: 'Burn something nearby.' }] }],
    ['Tracks', { tracks: [{ label: 'Charges', max: 3, marked: 1 }] }],
    ['Mysteries', { mysteries: [{ name: 'Unresolved', text: 'What is it for?' }] }],
    ['Consequences', { consequences: [{ label: 'Feverish', checked: false }] }],
  ] as Array<[string, DiscoveryBlock]>)(
    'keeps a hand-typed %s heading from being swallowed into Notes',
    (title, discovery) => {
      const c: Character = { ...clueFixture, traits: [], discovery };
      const md = writeCharacter(c, ctx);
      expect(md).toContain(`## ${title}`);
      const back = parseCharacter(md, ctx);
      expect(back.notes).toBe(c.notes);
    },
  );
});
