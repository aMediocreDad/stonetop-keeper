import { describe, expect, it } from 'vitest';
import type { Character } from '../../../../../types';
import { parseCharacter, writeCharacter } from '../character';
import type { VaultContext } from '../../context';

/**
 * The fidelity contract for a character sheet. The fixture is deliberately
 * MAXIMAL — every optional field populated, including the ones that hide inside
 * JSONB (`follower.leaderId`) and the ones with awkward text (`armorNote` with a
 * colon and parentheses, which is how a Fantasy Statblocks fence usually breaks).
 */

const ctx: VaultContext = {
  nameById: new Map([
    ['loc-1', 'Stonetop'],
    ['pc-9', 'Ana'],
    ['npc-2', 'Gero'],
  ]),
  idByName: new Map([
    ['Stonetop', 'loc-1'],
    ['Ana', 'pc-9'],
    ['Gero', 'npc-2'],
  ]),
};

const MAXIMAL: Character = {
  id: 'npc-2',
  space_id: '',
  name: 'Gero',
  type: 'PNJ',
  role: 'blessed · fisher',
  instinct: 'protect the weak',
  location: 'loc-1',
  // The mention is in the shape the EDITOR stores — `class`, and the visible
  // `@Label` inside the span. A fixture using an empty span is what let a
  // matcher that only accepted empty spans look correct while missing every
  // real mention in the database.
  notes: '<p>Keeps the <em>Sunken</em> inn with <span data-type="mention" class="mention" data-id="pc-9" data-label="Ana">@Ana</span>.</p><ul><li>owes a debt</li></ul>',
  gm_notes: '<p>Secretly <strong>indebted</strong>.</p>',
  traits: [
    { label: 'humorless', checked: true },
    { label: 'Eeyore voice', checked: false },
  ],
  tags: ['cunning', 'warrior'],
  gm_only: false,
  dead: true,
  kind: 'beast',
  threat: {
    instinct: 'to drown the valley',
    type: 'beast',
    portents: [
      { text: 'The wells turn brackish', done: true },
      { text: 'Cattle refuse the ford', done: false },
    ],
    impendingDoom: { text: '<p>The <strong>dam</strong> breaks.</p>', done: false },
    stakes: [{ text: 'Does Ana survive?', done: false }],
    gmMoves: ['Flood a cellar', 'Drown a hound'],
  },
  statblock: {
    hp: 12,
    armor: 1,
    armorNote: '0 to 2 (thick hides, shield)',
    damage: 'kick, trample d6+3 (hand, close, forceful)',
    specialQualities: 'amphibious: breathes water',
    moves: ['Drag someone under', 'Call the current'],
  },
  follower: { cost: 'a share of the catch', loyalty: 2, leaderId: 'pc-9' },
  discovery: null,
  created_at: '2026-05-14T20:29:30Z',
  updated_at: '2026-08-01T10:00:00Z',
};

describe('character notes', () => {
  it('round-trips a maximal character', () => {
    expect(parseCharacter(writeCharacter(MAXIMAL, ctx), ctx)).toEqual(MAXIMAL);
  });

  it('is byte-idempotent', () => {
    const once = writeCharacter(MAXIMAL, ctx);
    expect(writeCharacter(parseCharacter(once, ctx), ctx)).toBe(once);
  });

  it('round-trips a minimal character', () => {
    const minimal: Character = {
      id: 'c1', space_id: '', name: 'Nobody', type: 'PJ', role: '', instinct: '',
      notes: '', gm_notes: null, traits: [], tags: [], gm_only: false, dead: false,
      kind: null, threat: null, statblock: null, follower: null, discovery: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    expect(parseCharacter(writeCharacter(minimal, ctx), ctx)).toEqual(minimal);
  });

  it('keeps a follower block whose every field is empty', () => {
    // Without the `follower: true` presence marker this would come back null and
    // the sheet would silently stop being a follower.
    const c: Character = { ...MAXIMAL, follower: { cost: '', loyalty: 0, leaderId: null } };
    expect(parseCharacter(writeCharacter(c, ctx), ctx).follower).toEqual({
      cost: '', loyalty: 0, leaderId: null,
    });
  });

  it('writes a readable Obsidian wikilink, not the id-aliased form', () => {
    // [[target|display]] shows the DISPLAY half, so [[Ana|pc-9]] would render the
    // raw id to the reader. Mentions must hoist their ids to frontmatter.
    const md = writeCharacter(MAXIMAL, ctx);
    expect(md).toContain('[[Ana]]');
    expect(md).not.toContain('[[Ana|pc-9]]');
    expect(md).toContain('location: "[[Stonetop]]"');
  });

  // A mention's `data-label` is frozen at the moment it was typed, and the note
  // it must point at is named by `layout.ts` — renames, `/` in a name and
  // de-duplication all move the target without touching the span. Resolving
  // through the context is what keeps the link alive.
  it('links a mention to the note name, not the label frozen in the span', () => {
    const stale: Character = {
      ...MAXIMAL,
      notes: '<p>with <span data-type="mention" class="mention" data-id="pc-9" data-label="Ana the Fisher">@Ana the Fisher</span></p>',
    };
    const md = writeCharacter(stale, ctx);
    expect(md).toContain('[[Ana]]');
    expect(md).not.toContain('[[Ana the Fisher]]');
    expect(md).toContain('Ana: pc-9');
  });

  it('hoists a mention written inside the impending doom', () => {
    const doomed: Character = {
      ...MAXIMAL,
      threat: {
        ...MAXIMAL.threat!,
        impendingDoom: {
          text: '<p><span data-type="mention" class="mention" data-id="pc-9" data-label="Ana">@Ana</span> drowns.</p>',
          done: false,
        },
      },
    };
    const md = writeCharacter(doomed, ctx);
    expect(md).toContain('[[Ana]] drowns.');
    expect(md).not.toContain('[[Ana|pc-9]]');
    // …and the id comes back with it. Hoisting a field whose reader does not
    // re-inject would silently strip every mention in it down to a bare label.
    expect(parseCharacter(md, ctx).threat?.impendingDoom.text).toBe(
      doomed.threat!.impendingDoom.text,
    );
  });

  // FINAL REVIEW, finding 2. The IMPORT side inherits the tags-need-a-name rule
  // without a guard of its own, because `parseDiscovery` assembles a plain
  // object and returns `normalizeDiscovery(raw)` rather than the raw parse — so
  // every rule at that single boundary reaches a HAND-AUTHORED note too, not
  // only a block that came out of the app. Pinned through the `marked` clamp,
  // which is unambiguous and observable where the tags rule is not: the vault
  // format has no syntax for an unnamed move carrying tags (a bare
  // `### (tags)` reads back as a move NAMED "(tags)"), which is exactly why
  // the rule had to live at the boundary rather than in the writer.
  it('normalises a hand-edited note on the way IN, not only on the way out', () => {
    const disc: Character = {
      ...MAXIMAL,
      type: 'DISCOVERY',
      role: 'arcanum',
      discovery: { tracks: [{ label: 'Charges', max: 3, marked: 1 }] },
    };
    const handEdited = writeCharacter(disc, ctx).replace('Charges: 1/3', 'Charges: 9/3');
    expect(handEdited).toContain('Charges: 9/3');
    expect(parseCharacter(handEdited, ctx).discovery?.tracks).toEqual([
      { label: 'Charges', max: 3, marked: 3 },
    ]);
  });

  // The note's OWN headings are levels 5–6, so a heading someone typed inside
  // their prose cannot be mistaken for one of the sheet's sections.
  it('keeps a heading typed inside a note inside that note', () => {
    const withHeading: Character = {
      ...MAXIMAL,
      notes: '<p>Before.</p><h2>GM Notes</h2><p>Still the public note.</p>',
      gm_notes: '<p>Actually private.</p>',
    };
    const back = parseCharacter(writeCharacter(withHeading, ctx), ctx);
    expect(back.notes).toBe(withHeading.notes);
    expect(back.gm_notes).toBe('<p>Actually private.</p>');
  });

  // Hand-edited in Obsidian: a `##` heading the format does not know is prose,
  // and everything under it belongs to the section it was typed into.
  it('absorbs a hand-typed heading rather than truncating the field', () => {
    const md = [
      '---',
      'id: c9',
      'name: Nobody',
      '---',
      '## Notes',
      '',
      'First.',
      '',
      '## Rumours',
      '',
      'Second.',
      '',
      '## Traits',
      '',
      '- [x] humorless',
    ].join('\n');
    const back = parseCharacter(md, ctx);
    expect(back.notes).toContain('First.');
    expect(back.notes).toContain('Second.');
    expect(back.notes).toContain('<h2>Rumours</h2>');
    expect(back.traits).toEqual([{ label: 'humorless', checked: true }]);
  });

  // `threat: true` with the section deleted by hand used to index sections[-1]
  // and throw — and `readVault` skips a note that throws, so the whole sheet
  // was lost, not just its threat block.
  it('survives a threat marker whose section was deleted', () => {
    const md = ['---', 'id: c9', 'name: Nobody', 'threat: true', '---', '## Notes', '', 'Hi.'].join('\n');
    expect(() => parseCharacter(md, ctx)).not.toThrow();
    const back = parseCharacter(md, ctx);
    expect(back.name).toBe('Nobody');
    expect(back.threat?.portents).toEqual([]);
  });

  it('emits the raw id when the target is not in this export', () => {
    const lonely: VaultContext = { nameById: new Map(), idByName: new Map() };
    expect(writeCharacter(MAXIMAL, lonely)).toContain('location: loc-1');
  });

  it('quotes statblock strings so a colon cannot break the fence', () => {
    expect(writeCharacter(MAXIMAL, ctx)).toContain('armorNote: "0 to 2 (thick hides, shield)"');
  });

  // Regression: a real sheet whose threat still carries the PRE-2026-07 shape
  // (`stakes` as an HTML string, `impendingDoom` as bare text) crashed the whole
  // export — `taskList` got a string and `.map` is not a function. Restoring an
  // old revision can resurrect that shape at any time, so the writer must
  // normalise at its boundary exactly as `traverse.ts` does.
  // Both shapes below are taken from the live database, not invented.
  it('exports a threat whose stakes are still a legacy HTML string', () => {
    const legacy = {
      ...MAXIMAL,
      threat: {
        instinct: 'to drown the valley',
        type: 'beast',
        portents: [{ text: 'Wells turn brackish', done: true }],
        impendingDoom: { text: '<p>The dam breaks.</p>', done: false },
        stakes: '<p>Does Ana survive?</p><p>Who opened the crypt?</p>',
        gmMoves: ['Flood a cellar'],
      },
    } as unknown as Character;

    expect(() => writeCharacter(legacy, ctx)).not.toThrow();
    const back = parseCharacter(writeCharacter(legacy, ctx), ctx);
    // The legacy HTML becomes one checklist item per block, per normalizeThreatSheet.
    expect(back.threat?.stakes).toEqual([
      { text: 'Does Ana survive?', done: false },
      { text: 'Who opened the crypt?', done: false },
    ]);
    expect(back.threat?.impendingDoom.text).toContain('The dam breaks.');
  });

  it('exports a threat whose keys are entirely absent', () => {
    const bare = { ...MAXIMAL, threat: {} } as unknown as Character;
    expect(() => writeCharacter(bare, ctx)).not.toThrow();
    expect(parseCharacter(writeCharacter(bare, ctx), ctx).threat).toBeTruthy();
  });

  it('exports a statblock still carrying the legacy maxHp key', () => {
    const legacy = {
      ...MAXIMAL,
      statblock: { hp: 4, maxHp: 12, armor: 1, damage: 'd6', moves: ['one move'] },
    } as unknown as Character;
    expect(() => writeCharacter(legacy, ctx)).not.toThrow();
  });

  it('preserves a column that has no field rule yet', () => {
    const future = { ...MAXIMAL, morale: 3 } as unknown as Character;
    const back = parseCharacter(writeCharacter(future, ctx), ctx) as unknown as Record<string, unknown>;
    expect(back.morale).toBe(3);
  });
});
