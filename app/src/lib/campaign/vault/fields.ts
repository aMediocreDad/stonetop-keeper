import type {
  CampaignMap,
  Character,
  GmJournal,
  Location,
  MapPin,
  Relation,
  Timeline,
  ToneAndContent,
} from '../../../types';

/**
 * WHERE EVERY COLUMN GOES — and the guard that keeps the export honest.
 *
 * Each table's map is declared `satisfies Record<keyof Row, FieldRule>`, so
 * adding a column to a row type without deciding where it goes fails `tsc -b`
 * with `TS1360: Property 'x' is missing`. That is deliberate: the export must
 * NOT carry a hand-maintained column list that can silently fall behind the
 * schema — the exact failure mode that has bitten the write RPCs, where a new
 * column no-ops in silence until someone notices data going missing.
 *
 * A runtime test cannot express this. Nothing in the suite can enumerate the
 * real Postgres columns (`tsconfig.app.json` pins `types: ["vite/client"]`, so
 * a test cannot read the SQL), which is why the check lives in the type system.
 * Residual gap, stated rather than hidden: a column that exists in Postgres but
 * was never added to the TypeScript row type is invisible here — the app's
 * standing exposure, not one this introduces.
 *
 * The rules:
 *   frontmatter — a scalar that identifies, classifies or filters. Must be
 *                 something Obsidian's property system can type, so Bases can
 *                 filter on it.
 *   body        — content: prose, checklists, or a numeric block that reads as
 *                 a sheet.
 *   excluded    — deliberately not exported; every one is listed in the
 *                 manifest's `excluded` array so the omission is discoverable.
 */
export type FieldRule = 'frontmatter' | 'body' | 'excluded';

export const CHARACTER_FIELDS = {
  id: 'frontmatter',
  space_id: 'excluded', // constant across the export; lives in the manifest
  name: 'frontmatter',
  role: 'frontmatter',
  instinct: 'frontmatter',
  type: 'frontmatter',
  location: 'frontmatter', // emitted as a wikilink, or a raw id if not exported
  notes: 'body',
  traits: 'body', // {label, checked} -> task list
  tags: 'frontmatter',
  gm_only: 'frontmatter',
  dead: 'frontmatter',
  gm_notes: 'body',
  threat: 'body', // portents/stakes/doom/gmMoves; `type` flattens to frontmatter
  statblock: 'body', // the ```statblock fence
  kind: 'frontmatter',
  follower: 'frontmatter', // flattened: follower_cost/_loyalty/_leader
  discovery: 'body', // tier/interesting/useful flatten to frontmatter; moves,
                     // tracks, mysteries and consequences become sections
  created_at: 'frontmatter',
  updated_at: 'frontmatter',
} satisfies Record<keyof Character, FieldRule>;

export const LOCATION_FIELDS = {
  id: 'frontmatter',
  space_id: 'excluded',
  name: 'frontmatter',
  color: 'frontmatter',
  description: 'frontmatter',
  notes: 'body',
  tags: 'frontmatter',
  steading: 'body', // stats/treasury tables, debilities + requirements task lists
  gm_only: 'frontmatter',
  gm_notes: 'body',
  created_at: 'frontmatter',
} satisfies Record<keyof Location, FieldRule>;

export const RELATION_FIELDS = {
  id: 'body', // a column of the Relations.md table
  space_id: 'excluded',
  from_character_id: 'body',
  to_character_id: 'body',
  relation_type: 'body',
  relation_detail: 'body',
  gm_only: 'body',
  created_at: 'body',
} satisfies Record<keyof Relation, FieldRule>;

export const MAP_FIELDS = {
  id: 'frontmatter',
  space_id: 'excluded',
  name: 'frontmatter',
  description: 'frontmatter',
  location_id: 'frontmatter',
  image_path: 'frontmatter', // recorded for reference; the bytes ride as a file
  image_width: 'frontmatter',
  image_height: 'frontmatter',
  thumb: 'excluded', // ~20 kB data URL, regenerated from the image on import
  image_data: 'excluded', // localStorage fallback only, never from Supabase
  gm_only: 'frontmatter',
  created_at: 'frontmatter',
  updated_at: 'frontmatter',
} satisfies Record<keyof CampaignMap, FieldRule>;

export const PIN_FIELDS = {
  id: 'body', // a column of the map note's pin table
  map_id: 'body',
  space_id: 'excluded',
  x: 'body',
  y: 'body',
  character_id: 'body',
  location_id: 'body',
  label: 'body',
  note: 'body',
  gm_only: 'body',
  // Row bookkeeping, and the only fields here with nowhere legible to go: the
  // pin table is meant to be read AT the table, and two ISO timestamps per row
  // would double its width for something no one reads. Declared excluded rather
  // than declared 'body' and quietly not written — the rule has to match what
  // the writer does, or this table is decoration.
  created_at: 'excluded',
  updated_at: 'excluded',
} satisfies Record<keyof MapPin, FieldRule>;

export const TIMELINE_FIELDS = {
  id: 'excluded', // one row per space; the importer resolves it by space
  space_id: 'excluded',
  entries: 'body', // Chronicle/<year>.md
  gm_entries: 'body', // Chronicle/<year> (GM).md
  // The current-season marker rides in the MANIFEST's frontmatter rather than a
  // year's note, because it is space-level. It is still exported and restored —
  // it is campaign state, not bookkeeping.
  current_year: 'frontmatter',
  current_season: 'frontmatter',
  updated_at: 'excluded',
} satisfies Record<keyof Timeline, FieldRule>;

export const JOURNAL_FIELDS = {
  id: 'frontmatter',
  space_id: 'excluded',
  notes: 'body',
  wonders: 'body',
  updated_at: 'frontmatter',
} satisfies Record<keyof GmJournal, FieldRule>;

export const TONE_AND_CONTENT_FIELDS = {
  id: 'frontmatter',
  space_id: 'excluded',
  notes: 'body',
  updated_at: 'frontmatter',
} satisfies Record<keyof ToneAndContent, FieldRule>;

/** Every exclusion above, for the manifest. Keep in step with the tables. */
export const EXCLUSIONS = [
  'per-row space_id (constant; see space.id)',
  'map thumbnails (regenerated from the image)',
  'map image_data (localStorage fallback only)',
  'map pin created_at/updated_at (row bookkeeping; the pin table stays readable)',
  'timeline row id and updated_at (resolved by space on import)',
  'season rev counters (server-owned compare-and-swap state)',
  'revisions / the Ledger (audit log, not content)',
  "the space's invite code and password (a vault is meant to be shared; a way in is not)",
] as const;
