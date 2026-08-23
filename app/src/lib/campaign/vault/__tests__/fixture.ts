import type { Character } from '../../../../types';
import type { RawCampaignData } from '../../types';

// Shared fixture: the maximal campaign used by the round-trip contract
// and the manual dump helper.
const BASE: RawCampaignData = {
  characters: [
    {
      id: 'c1', space_id: 's1', name: 'Ana', type: 'PJ', role: 'blessed · fisher',
      instinct: 'protect the weak', location: 'loc-1',
      // Mention in the shape the EDITOR stores it (class, and the visible
      // `@Label` inside the span), plus a nested list: both are things a real
      // note holds and both were silently mangled before.
      notes: '<p>Grew up in <em>Stonetop</em>. Fears <span data-type="mention" class="mention" data-id="c2" data-label="The Drowned">@The Drowned</span>.</p><ul><li>owes a debt<ul><li>to the miller</li></ul></li></ul>',
      gm_notes: null,
      traits: [{ label: 'humorless', checked: true }], tags: ['warrior'],
      gm_only: false, dead: false, kind: null, threat: null, statblock: null,
      follower: null, discovery: null,
      created_at: '2026-05-14T20:29:30Z', updated_at: '2026-06-01T00:00:00Z',
    },
    {
      id: 'c2', space_id: 's1', name: 'The Drowned', type: 'MENACE', role: '',
      instinct: 'drown the valley', notes: '', gm_notes: '<p>It waits.</p>',
      traits: [], tags: [], gm_only: true, dead: false, kind: 'beast',
      threat: {
        instinct: 'to drown the valley', type: 'beast',
        portents: [{ text: 'Wells turn brackish', done: true }],
        impendingDoom: { text: '<p>The <strong>dam</strong> breaks.</p>', done: false },
        stakes: [{ text: 'Does Ana survive?', done: false }],
        gmMoves: ['Flood a cellar'],
      },
      statblock: {
        hp: 12, armor: 1, armorNote: '0 to 2 (thick hides, shield)',
        damage: 'trample d6+3 (close)', specialQualities: 'amphibious: breathes water',
        moves: ['Drag someone under'],
      },
      follower: { cost: 'a share of the catch', loyalty: 2, leaderId: 'c1' },
      discovery: null,
      created_at: '2026-05-15T00:00:00Z', updated_at: '2026-06-02T00:00:00Z',
    },
    {
      // A SITE, not an arcanum: the kind decides which relation is promoted
      // (lib/character/promotedRelations), and an arcanum promotes `held-by` —
      // its `leads-to` below would be inert and the Leads/Bonds split this
      // fixture exists to exercise would never render.
      id: 'd1', space_id: 's1', name: 'The bronze plate', type: 'DISCOVERY',
      role: 'site', instinct: '', location: 'loc-1',
      notes: '<p>A green disc, half-buried by the <em>ford</em>.</p>',
      gm_notes: '<p>Names <span data-type="mention" class="mention" data-id="c2" data-label="The Drowned">@The Drowned</span> in Maker-runes.</p>',
      // Requirements: the same {label, checked} shape as traits, which is what
      // lets a discovery's unlock list ride the existing column.
      traits: [
        { label: 'dig it up & clean the plate', checked: true },
        { label: 'decipher the Maker-runes', checked: false },
      ],
      tags: [], gm_only: true, dead: false, kind: null, threat: null,
      statblock: null, follower: null,
      // A partial block — the GM-held Know Things/Seek Insight pair a site
      // can carry without ever having a tier or card moves — so the WHOLE
      // vault round trip exercises `discovery` too, not just the isolated
      // character-level tests below.
      discovery: {
        interesting: 'the maker-runes name a forge, not a person',
        useful: 'the forge sits somewhere beneath Stonetop itself',
      },
      created_at: '2026-08-17T00:00:00Z', updated_at: '2026-08-17T00:00:00Z',
    },
  ],
  locations: [
    {
      id: 'loc-1', space_id: 's1', name: 'Stonetop', color: '#7AA177',
      description: 'marsh trading town',
      // A heading typed INSIDE a note: it must not read as one of the note's
      // own sections on the way back.
      notes: '<p>Founded on ruins.</p><h2>Rumours</h2><p>A drowned road.</p>',
      tags: ['home'], gm_only: false, gm_notes: null,
      created_at: '2026-05-14T20:29:30Z',
      steading: {
        size: 'village',
        stats: { fortunes: 1, population: 2, prosperity: -1, defenses: 0, surplus: 3 },
        debilities: { diminished: true, lacking: false, malcontent: false },
        resources: ['Timber'], fortifications: ['Palisade'], assets: ['The Forge'],
        treasury: {
          silver: { purses: 1, handfuls: 2, coins: 3 },
          gold: { purses: 0, handfuls: 0, coins: 0 },
        },
        improvements: [{
          id: 'mill', name: 'Mill', summary: 'Grinds grain.',
          requirements: [{ text: 'Pull Together ×5', done: false, progress: 3 }],
          effects: '+1 prosperity', completed: false, custom: false,
        }],
      },
    },
  ],
  relations: [
    {
      id: 'r1', space_id: 's1', from_character_id: 'c1', to_character_id: 'c2',
      relation_type: 'ennemi', relation_detail: 'since the flood',
      gm_only: false, created_at: '2026-05-20T00:00:00Z',
    },
    {
      id: 'r-lead', space_id: 's1', from_character_id: 'd1', to_character_id: 'c2',
      relation_type: 'leads-to', relation_detail: 'the runes name it',
      gm_only: true, created_at: '2026-08-17T00:00:00Z',
    },
  ],
  timeline: {
    id: 't1', space_id: 's1',
    entries: { '847': { spring: { title: 'The thaw', body: '<p>Ice broke early.</p>' } } },
    gm_entries: { '847': { winter: { title: '', body: '<p>Plotting.</p>' } } },
    current_year: 847, current_season: 'autumn', updated_at: '2026-08-01T00:00:00Z',
  },
  maps: [{
    id: 'm1', space_id: 's1', name: 'The Marsh', description: 'wet and wide',
    location_id: 'loc-1', image_path: 'spaces/s1/m1.jpg', image_width: 1200,
    image_height: 800, thumb: 'data:image/jpeg;base64,AAAA', gm_only: false,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z',
  }],
  mapPins: [{
    id: 'p1', map_id: 'm1', space_id: 's1', x: 0.2, y: 0.1, character_id: 'c1',
    location_id: null, label: null, note: 'last seen here', gm_only: false,
    // Populated on purpose: pin timestamps are a documented EXCLUSION, and a
    // fixture that already had them empty could not tell "excluded" from "kept".
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-03T00:00:00Z',
  }],
  gmJournal: {
    id: 'j1', space_id: 's1', notes: '<p>The crows are watching.</p>',
    wonders: [{ id: 'w1', text: 'Who opened the crypt?', resolved: false, created_at: '2026-07-01T00:00:00Z' }],
    updated_at: '2026-08-01T00:00:00Z',
  },
  toneAndContent: {
    id: 'tac1', space_id: 's1',
    notes: '<h2>Tone</h2><p>Plays it straight.</p><h2>Subject matter</h2><p>No spiders on camera.</p>',
    updated_at: '2026-08-20T00:00:00Z',
  },
};

/**
 * The fixture the contract tests run on, with one deliberate extra: `morale` is
 * a column that exists on the row but has no rule in `fields.ts` yet. It is here
 * so the no-column-list guarantee is exercised at VAULT level — a per-note test
 * would not catch `x_unmapped` breaking idempotence across a whole export.
 *
 * Cast because the whole point is a key `Character` does not declare; the rest
 * of the fixture stays type-checked against the real row types.
 */
export const FIXTURE: RawCampaignData = {
  ...BASE,
  characters: [
    { ...BASE.characters[0], morale: 3 } as unknown as RawCampaignData['characters'][number],
    ...BASE.characters.slice(1),
  ],
};

/**
 * A discovery with no card of its own — a site's GM-held pair, no tier, no
 * moves. `d1` above, unchanged: the "omits every section" test needs a
 * discovery whose `## Moves` heading and `tier` frontmatter genuinely do not
 * appear, and `d1` already carries a *partial* block (interesting/useful, no
 * tier or moves) rather than none at all, which is the stronger version of
 * that same proof.
 */
export const clueFixture: Character = FIXTURE.characters[2];

/**
 * An arcanum's full card: tier, the GM-held pair, two front moves (one
 * carrying the unlock mark), a track and a consequence — everything the
 * `discovery block export` tests in `roundtrip.test.ts` exercise. Kept
 * standalone rather than folded into `BASE`/`FIXTURE`: those drive the
 * WHOLE-vault contract via `writeVault`/`readVault`, and adding a location-
 * and relation-free character there would need no wiring, but this fixture is
 * only ever run through `writeCharacter`/`parseCharacter` directly.
 */
export const arcanumFixture: Character = {
  id: 'd2', space_id: 's1', name: 'The Red Scepter', type: 'DISCOVERY',
  role: 'arcanum', instinct: '', location: 'loc-1',
  notes: '<p>A slim iron scepter chased with maker-sigils.</p>',
  gm_notes: null,
  traits: [{ label: 'attuned by holding it through a full moon', checked: true }],
  tags: ['arcanum'], gm_only: true, dead: false, kind: null, threat: null,
  statblock: null, follower: null,
  discovery: {
    tier: 'minor',
    interesting: 'a maker sigil',
    useful: 'the device is nearby',
    moves: [
      {
        name: 'Inflame',
        tags: 'near, magical',
        text: 'When you wield the Scepter, name a target within near range and '
          + 'roll +WIS. On a 10+, choose 2. On a 7-9, choose 1:\n'
          + '- Act as you suggest\n'
          + '- Reveal a secret they hold\n'
          + 'On a 6-, the scepter inflames your own judgment instead.',
      },
      {
        name: 'Ward',
        tags: 'reload',
        text: 'Spend a charge to shrug off a blow that would mark you.',
        gained: true,
      },
    ],
    tracks: [{ label: 'Charges', max: 3, marked: 2 }],
    mysteries: [
      { name: 'What is it for?', text: 'The scepter was forged to command something. What?' },
    ],
    consequences: [{ label: 'Your skin becomes feverish', checked: false }],
  },
  created_at: '2026-08-18T00:00:00Z', updated_at: '2026-08-18T00:00:00Z',
};
