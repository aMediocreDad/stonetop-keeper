export interface Trait {
  label: string;
  checked: boolean;
}

/** The book's eight threat types (threat JSONB, `type` key). */
export type ThreatType =
  | 'affliction' | 'beast' | 'institution' | 'macguffin'
  | 'magical-entity' | 'rabble' | 'villain' | 'wildcard';

/** The "follower" layer — its presence makes instinct/statblock visible to
 *  players (a sheet owned by the player). The
 *  `characters.follower` column, INDEPENDENT of the stat block: a follower can
 *  have no stats at all, and a statted monster is not a follower. */
export interface FollowerBlock {
  cost: string;
  /** 0..3 (clamped in lib/statblock). */
  loyalty: number;
  /** PJ meneur ; null/absent = suit le groupe entier. */
  leaderId?: string | null;
}

/**
 * Stonetop stat block (monster OR follower — same shape),
 * stored as a single JSONB block on `characters.statblock`; null = a
 * character with no stats. Normalized on read by [lib/statblock] — restored
 * revisions can carry partial shapes at any time.
 *
 * Carries ONLY stats: `kind` (bestiary category) and `follower` classify the
 * SHEET, not its stats, and so live in their own columns
 * (`characters.kind` / `characters.follower`). Older rows still carry them
 * here — read fallback in [lib/statblock], promoted to the column at the next
 * save.
 */
export interface StatBlock {
  /**
   * The book's HP pool — a sheet VALUE, not a session counter: the table does
   * not track HP between sessions, so nothing decrements it in the UI. Older
   * rows carried `hp`/`maxHp` (counter + max); normalizeStatBlock keeps
   * `maxHp` when it is there and drops the key, so the migration happens at
   * the next save.
   */
  hp: number;
  armor: number;
  /** "0 to 2 (thick hides, shield)" — optional free text. */
  armorNote?: string;
  /** Free text: "kick, trample d6+3 (hand, close, forceful)". */
  damage: string;
  specialQualities?: string;
  /** The book's ► bullets. */
  moves: string[];
}

// ----------------------------------------------------------------------
// Discovery per-kind fields. Stored as one JSONB block on
// `characters.discovery`; null = a discovery with no per-kind fields, which
// is every discovery until someone fills one in.
//
// FLAT, not nested per kind. The book is explicit that kinds shift — "these
// aren't formal categories, and they often overlap" — and the
// subtype is a freely editable single-select for that reason. Re-filing a clue
// as an artifact must KEEP what was written and simply stop displaying it.
// Per-kind sub-objects would strand data behind a key nobody reads.
//
// Meaningless on the other four types: the sheet does not offer it and nothing
// displays it. NOT forbidden in the database — a restored revision or a
// hand-written MCP payload can carry it, so read paths tolerate and ignore.
// ----------------------------------------------------------------------

/** One move on a card: an artifact's custom move, an arcanum's front move, or
 *  one of the mysteries on its back. */
export interface ArcMove {
  name: string;
  /** Rendered as one parenthesised line — "(near, magical, reload)". A string
   *  and not string[]: it displays as a line, and a second TagEditor per move
   *  buys nothing. */
  tags?: string;
  /** Plain text. Lines beginning `-` or `•` render as the option list — see
   *  parseMoveBody. NOT TipTap HTML: bodies are three formulaic sentences, and
   *  plain text exports to the Obsidian vault as Markdown untouched. */
  text: string;
  /** `mysteries` only: the book's ☐ beside the move name — gained on unlock. */
  gained?: boolean;
}

/** A markable pip row: the Red Scepter's charges (max 3) or its progress
 *  track (max 4). */
export interface ArcTrack {
  label: string;
  max: number;
  marked: number;
}

export interface DiscoveryBlock {
  /** Arcanum only: a small card, or a half-page playbook insert. */
  tier?: 'minor' | 'major';
  /** The Know Things / Seek Insight pair — clue and artifact.
   *  GM-HELD: both keys are stripped for non-GM viewers by
   *  app_character_row_for_role, because publishing a clue must not publish
   *  the answers the GM is holding back. */
  interesting?: string;
  useful?: string;
  /** Front-of-card moves: an artifact's custom move, an arcanum's pre-unlock
   *  move. Player-visible — an arcanum is a handout. */
  moves?: ArcMove[];
  tracks?: ArcTrack[];
  /** The back of the card: moves gained when the mysteries unlock. */
  mysteries?: ArcMove[];
  consequences?: Trait[];
}

// ----------------------------------------------------------------------
// Steading (the settlement sheet — Stonetop playbook). Stored as a single
// JSONB block on `locations.steading`; null = a "plain" location.
// ----------------------------------------------------------------------
export type SteadingSize = 'hamlet' | 'village' | 'town' | 'city';

export interface SteadingStats {
  /** Tracks -1..+3 (clamped in the UI). */
  fortunes: number;
  population: number;
  prosperity: number;
  defenses: number;
  /** Counter ≥ 0. */
  surplus: number;
}

export interface SteadingDebilities {
  diminished: boolean;
  lacking: boolean;
  malcontent: boolean;
}

export interface TreasuryPile {
  purses: number;
  handfuls: number;
  coins: number;
}

export interface SteadingTreasury {
  silver: TreasuryPile;
  gold: TreasuryPile;
}

export interface ImprovementRequirement {
  text: string;
  done: boolean;
  /**
   * Ticks made against repeatable requirements ("Pull Together ×5").
   * The total is derived from the text (×N); absent = 0, or a simple
   * requirement.
   */
  progress?: number;
}

export interface SteadingImprovement {
  /** Stable slug for the seeds (e.g. "mill"), uuid-like for custom ones. */
  id: string;
  name: string;
  summary: string;
  requirements: ImprovementRequirement[];
  effects: string;
  completed: boolean;
  custom: boolean;
}

export interface Steading {
  size: SteadingSize;
  stats: SteadingStats;
  debilities: SteadingDebilities;
  resources: string[];
  fortifications: string[];
  assets: string[];
  treasury: SteadingTreasury;
  improvements: SteadingImprovement[];
}

/**
 * A customizable location. The GM chooses the name and the colour.
 * Each grimoire (`space`) has its own list of locations.
 * `Character.location` stores the Location's `id` (no longer its name).
 */
export interface Location {
  id: string;
  space_id: string;
  name: string;
  /** Hex colour (e.g. "#7AA177"). Used everywhere (chip, sheet, graph). */
  color: string;
  /** Short hook shown on the banner/sheet ("marsh trading town"). */
  description?: string;
  /** Rich HTML notes (Tiptap), like `Character.notes`. */
  notes?: string;
  tags?: string[];
  /** The full settlement sheet; null/undefined = a plain location. */
  steading?: Steading | null;
  /** GM only: hidden from player/viewer readers. */
  gm_only: boolean;
  /** Rich HTML notes (Tiptap), visible to the GM alone; null for non-GMs. */
  gm_notes?: string | null;
  created_at: string;
}

export type SpaceRole = 'viewer' | 'player' | 'gm';

/** A tickable item on a threat sheet (portent, stake, impending doom). */
export interface ThreatPortent {
  text: string;
  done: boolean;
}

/**
 * Threat sheet — stored as a single JSONB block on `characters.threat`;
 * null = a character with no threat sheet. `name` and `notes` (description)
 * reuse the character's existing columns; the archetype is `type` below (the
 * book's eight types) and NOT the `role` column, which a threat does not have.
 * Legacy shape (stakes as HTML, doom as bare text): normalized on read by
 * [lib/threatSheet] — restoring a revision can resurrect the old shape at any
 * time.
 */
export interface ThreatSheet {
  instinct: string;
  portents: ThreatPortent[];
  /** `text` has been rich HTML (Tiptap) since the 2026-07 rework. */
  impendingDoom: ThreatPortent;
  /** Open questions, ticked when play answers them (previously: HTML). */
  stakes: ThreatPortent[];
  gmMoves: string[];
  /** Threat type (the book's enum); null = not chosen yet. */
  type?: ThreatType | null;
}

/**
 * What kind of entry a `Character` row is. The codes are French because the
 * column values are — renaming them is a data migration, not a rename, so the
 * wire format stays as it is and only the *type* is named here.
 *
 * Everything that switches on `Character.type` should reference this alias
 * rather than re-spelling the union: before it existed the four literals
 * (DISCOVERY did not exist yet) were written out at 117 sites and the
 * dashboard filter kept its own copy of the list, which is exactly how the
 * two drift.
 */
export type CharacterType = 'PJ' | 'PNJ' | 'GROUPE' | 'MENACE' | 'DISCOVERY';

/** Display/iteration order for the dashboard filter. Same members as `CharacterType`. */
export const CHARACTER_TYPES = ['PJ', 'PNJ', 'GROUPE', 'MENACE', 'DISCOVERY'] as const satisfies readonly CharacterType[];

export interface Character {
  id: string;
  space_id: string;
  name: string;
  /** Playbook (PJ), occupation (PNJ) or role in the group (GROUPE), encoded
   *  as "prefix · free text" for a PC (cf. lib/rolePrefix). A MENACE has NONE:
   *  its archetype is its threat type. The sheet no longer
   *  offers it and nothing displays it for that type — but older rows may
   *  still carry one, never erased silently. A DISCOVERY reads this column as
   *  its SUBTYPE (`clue`, `site`, `encounter`, `opportunity`, `artifact`,
   *  `arcanum`) — one column read according to the type, same pattern as
   *  `dead` below. Read it through [lib/character/discoveryKinds].getDiscoveryKind,
   *  never raw: `''` is a real state ("unfiled") and an unrecognised value must
   *  not throw. */
  role: string;
  /** Instinct "to [do something]" — stored WITHOUT the "to" prefix, shared by
      every type. For a MENACE the old shape lived in threat.instinct: read via
      [lib/instinct], written to the column alone. Meaningless on a DISCOVERY:
      the sheet does not offer it and nothing displays it for that type. NOT
      forbidden in the database — a restored revision or a hand-written MCP
      payload can carry it, so read paths tolerate and ignore it rather than
      asserting absence. */
  instinct: string;
  type: CharacterType;
  /**
   * The id of a `Location` in the same `space`. Optional (a character can be
   * "of no known place"). For older records storing a plain location name, the
   * load-time migration replaces it with the matching `id`.
   *
   * `null` and `undefined` are NOT interchangeable on the way OUT: the column
   * is nullable, and `update_character` writes it only when the key is present
   * in `p_data` — `JSON.stringify` drops an undefined-valued key, so clearing
   * the place MUST send an explicit `null` (same rule as `Map.location_id`).
   */
  location?: string | null;
  notes: string;
  traits: Trait[];
  tags: string[];
  /** GM only: hidden from player/viewer readers. */
  gm_only: boolean;
  /**
   * The entry has left play. ONE column read according to the type, like
   * `role` above: a PC/NPC is deceased, a GROUP is disbanded. A campaign fact
   * (not GM prep, cf. instinct/statblock): anyone who can write the sheet can
   * tick it.
   *
   * NEVER offered on a MENACE — its end is already modelled by its portents
   * and its impending doom. Nothing forbids it in the database for all that: a
   * restored revision can carry the key on any row.
   *
   * Meaningless on a DISCOVERY: the sheet does not offer it and nothing
   * displays it for that type. NOT forbidden in the database — a restored
   * revision or a hand-written MCP payload can carry it, so read paths
   * tolerate and ignore it rather than asserting absence.
   */
  dead: boolean;
  /** Rich HTML notes (Tiptap), visible to the GM alone; null for non-GMs. */
  gm_notes?: string | null;
  /**
   * The full threat sheet (type `MENACE`); null/undefined otherwise.
   *
   * Meaningless on a DISCOVERY: the sheet does not offer it and nothing
   * displays it for that type. NOT forbidden in the database — a restored
   * revision or a hand-written MCP payload can carry it, so read paths
   * tolerate and ignore it rather than asserting absence.
   */
  threat?: ThreatSheet | null;
  /**
   * Stat block monstre/follower ; null/undefined = pas de stats.
   *
   * Meaningless on a DISCOVERY: the sheet does not offer it and nothing
   * displays it for that type. NOT forbidden in the database — a restored
   * revision or a hand-written MCP payload can carry it, so read paths
   * tolerate and ignore it rather than asserting absence.
   */
  statblock?: StatBlock | null;
  /**
   * Bestiary category (the danger-* stamp); null = the default entity stamp.
   * Independent of `statblock`: this classifies the SHEET. Never set on a
   * `GROUPE` (the group stamp is the only right one) nor on a `PJ` (whose
   * playbook lives in `role`).
   *
   * Meaningless on a DISCOVERY: the sheet does not offer it and nothing
   * displays it for that type. NOT forbidden in the database — a restored
   * revision or a hand-written MCP payload can carry it, so read paths
   * tolerate and ignore it rather than asserting absence.
   */
  kind?: import('../lib/character/monsterKinds').MonsterKind | null;
  /**
   * The follower layer; null/undefined = not a follower. THIS field is what
   * governs player visibility of instinct/statblock (see
   * [lib/statblock].isFollower and supabase-statblock.sql).
   *
   * NEVER on a MENACE: a follower accompanies the PCs and its sheet belongs to
   * their player, whereas a threat sheet is GM prep. The
   * checkbox is not offered and the server refuses the consequence — but the
   * SHAPE can survive on an old row or a restored revision, so reading this
   * field alone is not enough: go through isFollower(), which knows the type.
   *
   * Meaningless on a DISCOVERY: the sheet does not offer it and nothing
   * displays it for that type. NOT forbidden in the database — a restored
   * revision or a hand-written MCP payload can carry it, so read paths
   * tolerate and ignore it rather than asserting absence.
   */
  follower?: FollowerBlock | null;
  /**
   * Per-kind DISCOVERY fields; null = none set. Read through
   * `normalizeDiscovery` (lib/character/discoveryBlock), never raw: a
   * restored revision can carry a partial or foreign shape.
   *
   * Unlike `statblock`, this column is NOT privilege-gated on write — the
   * player marks their own arcanum's charges and consequences. The GM-held
   * keys are removed on READ instead. See the spec's §4.
   */
  discovery?: DiscoveryBlock | null;
  created_at: string;
  updated_at: string;
}

export interface Relation {
  id: string;
  space_id: string;
  from_character_id: string;
  to_character_id: string;
  /**
   * The id of a relation type from `RELATION_TYPES` (`ami`, `ennemi`, etc.).
   * For older free-text records, the load-time migration remaps by keyword to
   * the most likely id (`autre` as the fallback).
   */
  relation_type: string;
  /** Optional free-text detail ("childhood friend", "rival since the boar hunt"…). */
  // Nullable in Postgres, so a row read back genuinely carries null — and the
  // editor needs to SEND null to clear it (key presence is what makes the RPC
  // write the column).
  relation_detail?: string | null;
  /** GM only: hidden from player/viewer readers. */
  gm_only: boolean;
  created_at: string;
}

/**
 * An illustrated map (private image in Storage, pinnable). `image_*` are set
 * server-side by the Edge Function after validation — never by the client.
 * `thumb`: a small data-URL preview generated client-side at upload.
 */
export interface CampaignMap {
  id: string;
  space_id: string;
  name: string;
  description?: string | null;
  /** Associated location/settlement (optional). */
  location_id?: string | null;
  /** Chemin de l'objet Storage — serveur uniquement. */
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  /** Data-URL preview (~20 kB) for the grid, with no Storage round trip. */
  thumb?: string | null;
  /** GM only: hidden from player/viewer readers. */
  gm_only: boolean;
  /**
   * Only present in the localStorage fallback: full image as a data-URL
   * (same caveat as `Space.password_hash` — never comes from Supabase).
   */
  image_data?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A pin on a map. Coordinates normalized 0..1 (independent of
 * zoom/resolution). `character_id`/`location_id`: a pin bound to a sheet (at
 * most one of the two); neither = a free note (label required).
 */
export interface MapPin {
  id: string;
  map_id: string;
  space_id: string;
  x: number;
  y: number;
  character_id?: string | null;
  location_id?: string | null;
  label?: string | null;
  note?: string | null;
  /** GM only: hidden from player/viewer readers. */
  gm_only: boolean;
  created_at: string;
  updated_at: string;
}

/** Upload payload prepared client-side (see lib/imageClient.ts). */
export interface MapImageUpload {
  blob: Blob;
  width: number;
  height: number;
  /** Data URL (downscaled) — used by the localStorage fallback only. */
  dataUrl: string;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** One season entry: optional title + HTML body (Tiptap). */
export interface SeasonEntry {
  title?: string;
  body: string;
  /**
   * Revision counter for the per-season save (compare-and-swap).
   * Absent = 0 (historical entries / raw strings). Incremented by the server
   * on every write — never by the client.
   */
  rev?: number;
}

/** An entry's strand: player (shared) or GM (notes in the margin). */
export type TimelineStrand = 'player' | 'gm';

/**
 * A season's stored value. Backwards compatible: older entries (and the seeds)
 * are raw HTML text; newer ones are titled objects. We normalize on read
 * (`lib/seasonEntry.ts`) — no data migration.
 */
export type StoredSeason = string | SeasonEntry;

/** One entry per season of a year. */
export interface TimelineEntry {
  spring?: StoredSeason;
  summer?: StoredSeason;
  autumn?: StoredSeason;
  winter?: StoredSeason;
}

/**
 * The "Chronicles" timeline — one per grimoire (`space`). All the content is
 * stored as a single block: the `entries` map indexed by year (key = string).
 * The displayed year range is DERIVED from the content (see
 * `lib/timelineRange.ts`), no longer stored.
 */
export interface Timeline {
  id: string;
  space_id: string;
  entries: Record<string, TimelineEntry>;
  /** The "current season" marker, set from the Chronicles wheel. */
  current_year?: number | null;
  current_season?: Season | null;
  /** GM strand only — same shape as `entries`, null/absent for non-GMs. */
  gm_entries?: Record<string, TimelineEntry> | null;
  updated_at: string;
}

export interface Space {
  id: string;
  name: string;
  invite_code: string;
  /**
   * Only present in the localStorage fallback. With the Supabase backend the
   * hash never leaves the server — auth RPCs return the space WITHOUT it.
   */
  password_hash?: string;
  /**
   * Only present in the localStorage fallback, same caveat as `password_hash`.
   */
  player_password_hash?: string;
  /** Off by default: an empty password only grants 'viewer' access when true. */
  public_read?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpaceSession {
  space: Space;
  isAdmin: boolean;
  token: string;
  role: SpaceRole;
}

/** One "I wonder..." entry — struck through when resolved; the optional
 *  resolution ("how it turned out") is never required. */
export interface Wonder {
  id: string;
  text: string;
  resolved: boolean;
  resolution?: string;
  created_at: string;
}

/**
 * The GM's journal — a single row per grimoire (`space`), GM only: non-GMs
 * never receive the row (the get_gm_journal RPC returns empty).
 */
export interface GmJournal {
  id: string;
  space_id: string;
  /** Notes riches HTML (Tiptap). */
  notes: string;
  wonders: Wonder[];
  updated_at: string;
}

/**
 * The table's shared agreement — Concept, Aim, Tone, Subject matter, written
 * as headings inside ONE Tiptap field. One row per grimoire (`space`).
 *
 * Deliberately NOT GM-gated, unlike [[GmJournal]]: Stonetop says anyone at the
 * table may call for content to be excluded or veiled, at any time.
 * Every role reads it; player and GM write it; viewers, like
 * everywhere else, do not.
 *
 * Unstructured on purpose. The book's three lists (excluded / veiled / special
 * handling) are genuinely list-shaped and may become columns later — see the
 * design doc's "Deliberately unstructured". Nothing here has to be undone.
 */
export interface ToneAndContent {
  id: string;
  space_id: string;
  /** Notes riches HTML (Tiptap). */
  notes: string;
  updated_at: string;
}

// ----------------------------------------------------------------------
// The revision journal ("Ledger") — GM only. One record per modified row,
// grouped by `event_id`: one RPC call = one event, cascades included (see
// supabase-revisions.sql).
// ----------------------------------------------------------------------
export type RevisionOp = 'INSERT' | 'UPDATE' | 'DELETE';

export type RevisionTable =
  | 'characters' | 'relations' | 'locations' | 'maps' | 'map_pins' | 'timelines'
  | 'gm_journal' | 'tone_and_content';

export interface RevisionRow {
  table_name: RevisionTable;
  row_id: string;
  op: RevisionOp;
  /** The fields actually modified; empty for INSERT/DELETE. */
  changed: string[];
  /** Label identifying the row, computed server-side (name, "A → B", seasons…). */
  label: string | null;
}

export interface RevisionEvent {
  event_id: string;
  at: string;
  actor_role: SpaceRole | null;
  /** Keyset cursor: the event's largest `revisions.id`. */
  last_id: number;
  rows: RevisionRow[];
}

export type UndoAction = 'restore' | 're-insert' | 'remove';

export interface UndoPlanRow {
  table_name: RevisionTable;
  row_id: string;
  action: UndoAction;
  label: string | null;
  /** The row has moved since the event — undoing will overwrite those diffs. */
  changed_since: boolean;
  /** Only set when the caller passed `p_expect_event_id` (a grouped ledger
   * card's newest event) — null otherwise. True means the row's current
   * state still matches that newest event's `after`, so every difference
   * from THIS event's `after` is the group's own later edits, not a
   * third-party write; false means something outside the group touched
   * the row and the ordinary changed_since warning must still show. */
  group_intact: boolean | null;
  unrestorable: boolean;
  /** `character_missing`, `map_missing`, `location_missing`, `exists`… */
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface UndoPlan {
  event_id: string;
  at: string;
  rows: UndoPlanRow[];
}

export interface UndoResultRow {
  table_name: RevisionTable;
  row_id: string;
  action: UndoAction;
  status: 'done' | 'skipped';
  reason: string | null;
}

export interface UndoResult {
  /** The event CREATED by the undo — undoing that in turn is a redo. */
  event_id: string;
  rows: UndoResultRow[];
}
