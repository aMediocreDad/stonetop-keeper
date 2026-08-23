// Relative imports on purpose: the MCP Worker consumes this module and its
// vitest cannot resolve the `@` alias (cf. lib/threatSheet.ts).
import type { Character, FollowerBlock, StatBlock } from '../../types';
import { MONSTER_KINDS, type MonsterKind } from './monsterKinds';
import { getDiscoveryKind } from './discoveryKinds';

export const LOYALTY_MAX = 3;

const KIND_KEYS = new Set<string>(MONSTER_KINDS.map((k) => k.key));

/** NaN/garbage → fallback, sinon arrondi entier. */
function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function clampLoyalty(v: number): number {
  return Math.max(0, Math.min(LOYALTY_MAX, toInt(v, 0)));
}

/** HP 6 by default: "Starts at 6" (Crew sheet, Book I). */
export function emptyStatBlock(): StatBlock {
  return { hp: 6, armor: 0, armorNote: '', damage: '', specialQualities: '', moves: [] };
}

export function emptyFollower(): FollowerBlock {
  return { cost: '', loyalty: 0, leaderId: null };
}

/**
 * The single read boundary for the block — like normalizeThreatSheet, it is
 * PERMANENT: restoring a revision can resurrect a partial shape at any time.
 * Always returns a fresh, mutable object.
 *
 * `kind`/`follower` are deliberately LEFT OUT: they have their own columns
 * (see kindOf/followerOf). Reading them here would reintroduce them into the
 * JSONB at the next save.
 */
export function normalizeStatBlock(raw: unknown): StatBlock | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  // Historical rows: `hp` was the session counter and `maxHp` the pool. We no
  // longer track HP, so it is the POOL that survives — otherwise a monster
  // left at 2/6 would read back as "HP 2". `maxHp` is not returned: the key
  // disappears from storage at the next save.
  const hp = Math.max(0, toInt(b.maxHp ?? b.hp, 6));
  return {
    hp,
    armor: Math.max(0, toInt(b.armor, 0)),
    armorNote: typeof b.armorNote === 'string' ? b.armorNote : '',
    damage: typeof b.damage === 'string' ? b.damage : '',
    specialQualities: typeof b.specialQualities === 'string' ? b.specialQualities : '',
    moves: Array.isArray(b.moves) ? b.moves.filter((m): m is string => typeof m === 'string') : [],
  };
}

export function normalizeKind(raw: unknown): MonsterKind | null {
  return typeof raw === 'string' && KIND_KEYS.has(raw) ? (raw as MonsterKind) : null;
}

export function normalizeFollower(raw: unknown): FollowerBlock | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  return {
    cost: typeof f.cost === 'string' ? f.cost : '',
    loyalty: clampLoyalty(f.loyalty as number),
    leaderId: typeof f.leaderId === 'string' && f.leaderId !== '' ? f.leaderId : null,
  };
}

/**
 * The old shape: `kind` and `follower` lived INSIDE the stat block. The
 * migration filled the columns for every row on the server, but two paths
 * resurrect the old shape at any time — the offline localStorage cache written
 * before the migration, and restoring a revision older than it. This fallback
 * is therefore PERMANENT, exactly like instinctOf/threatTypeOf; promotion to
 * the column happens at the sheet's next save.
 */
function legacyBlock(c: Pick<Character, 'statblock'>): Record<string, unknown> {
  return (c.statblock ?? {}) as unknown as Record<string, unknown>;
}

type KindSource = Pick<Character, 'statblock'> & Pick<Character, 'kind'>;
type FollowerSource = Pick<Character, 'statblock'> & Pick<Character, 'follower'>;

export function kindOf(c: KindSource): MonsterKind | null {
  return normalizeKind(c.kind ?? legacyBlock(c).kind);
}

/**
 * A sheet's effective category: an NPC with no category IS a bestiary "NPC"
 * (Book II) — that is the neutral category, not an absence. It already carries
 * the same stamp as the default entity, so "no type" and "NPC" meant the same
 * thing on screen; keeping only "NPC" avoids offering a distinction without a
 * difference.
 *
 * Nothing else takes a default: a PC carries its playbook, a GROUP its group
 * stamp (no selector), and for a MENACE the category is only a stamp choice,
 * legitimately empty.
 */
export function kindWithDefault(c: KindSource & Pick<Character, 'type'>): MonsterKind | null {
  return kindOf(c) ?? (c.type === 'PNJ' ? 'npc' : null);
}

/**
 * `npc` is the bestiary's NEUTRAL category: it says "this is not a monster".
 * Any other category (beast, undead, spirit…) IS a monster's nature — the book
 * even calls them nature tags ("other tags describe a monster's basic nature
 * (e.g. construct, spirit, undead)"). So `kind` alone carries
 * monsterhood: no extra flag to store.
 */
export function isMonsterKind(k: MonsterKind | null | undefined): boolean {
  return k != null && k !== 'npc';
}

/**
 * `c.type !== 'DISCOVERY'` mirrors `isFollower`'s own `MENACE` exclusion
 * below: a discovery is "something there is to find" (a clue, a site, an
 * artifact), not an actor with a nature — its `kind` column is meaningless,
 * whatever it holds. The exclusion belongs HERE, in the predicate, and not at
 * the call sites: `kindOf`/`kindWithDefault` must keep returning the stored
 * value verbatim (a restored revision or an MCP payload can put a monster
 * `kind` on a discovery row at any time, and that shape has to survive the
 * round trip), so only the INTERPRETING predicate may deny it meaning. This
 * also keeps the client in parity with the server: `app_character_mechanics_
 * open` (supabase-statblock.sql) excludes `DISCOVERY` the same way, so the two
 * now agree on what a discovery is never allowed to be. Do not "simplify"
 * this back to a bare `isMonsterKind(kindWithDefault(c))` — that would let a
 * stale `kind` reintroduce monsterhood (and its tags) onto a discovery.
 */
export function isMonster(c: KindSource & Pick<Character, 'type'>): boolean {
  return c.type !== 'DISCOVERY' && isMonsterKind(kindWithDefault(c));
}

/** The category set when "Monster" is ticked: the first of the list, and the
 *  monster archetype itself. Visible and changeable in the same breath (the
 *  selector appears just below), like emptyStatBlock's 6 HP. */
export const DEFAULT_MONSTER_KIND: MonsterKind = 'beast';

/**
 * Tags are game STATS, not free labelling: "Flesh out details as needed, such
 * as: … Game stats: tags, HP, armor, damage, and GM moves" (NPC
 * creation), and they only appear when the sheet is treated as a follower
 * ("give each follower 2-4 tags") or as a monster (
 * organisation/size/nature/behaviour). An ordinary NPC carries memorable
 * TRAITS instead; a PC and a threat have neither.
 *
 * A GROUP counts as soon as it is statted: "group" is itself an organisation
 * tag, and a group-follower is a troop ("if you're creating a group follower,
 * pick tags that apply to the entire group").
 *
 * A MENACE therefore only gets in through the "monster" door: it is never a
 * follower (cf. isFollower).
 */
/**
 * The two discovery kinds that carry game elements. The book writes them as
 * TAGS and not as fields — "(beautiful, Value 2)", "(cumbersome, magical)",
 * fragile, indestructible, requires ___ — with load as a glyph inside the same
 * parenthesis. So Value and load need no columns of their own;
 * the `tags` column, dead on a discovery until now, is their home.
 *
 * Kind-gated and not type-gated: a clue has no game elements, and offering the
 * field on one would invite stat-shaped notes onto something that is a
 * signifier, not an object.
 */
function discoveryCarriesTags(c: Pick<Character, 'type' | 'role'>): boolean {
  if (c.type !== 'DISCOVERY') return false;
  const kind = getDiscoveryKind(c.role);
  return kind === 'artifact' || kind === 'arcanum';
}

export function tagsApply(
  c: KindSource & FollowerSource & Pick<Character, 'type' | 'role'>,
): boolean {
  // `discoveryCarriesTags` FIRST and independently: isMonster/isFollower both
  // deny a discovery outright, so a leftover `kind` or follower block on one
  // can never route it through the monster door.
  return discoveryCarriesTags(c) || isMonster(c) || isFollower(c);
}

export function followerOf(c: FollowerSource): FollowerBlock | null {
  return normalizeFollower(c.follower ?? legacyBlock(c).follower);
}

/**
 * Followerhood = a follower sub-block is present (an object) ON A SHEET THAT
 * CAN BE ONE. THIS predicate is what governs player visibility of
 * instinct/statblock — parity with app_character_mechanics_open on the SQL
 * side, `type` included.
 *
 * A MENACE is NEVER a follower: a follower accompanies the PCs and its sheet
 * belongs to their player, whereas a threat sheet is GM prep
 *. The test looks at the type and not only at the shape because
 * the shape survives: a threat can carry a follower block written before this
 * rule, or resurrected by a revision restore. We tolerate the stored shape and
 * refuse the consequence — exactly like the SQL, which for the same reason
 * adds no CHECK constraint.
 *
 * A DISCOVERY is NEVER one either, for the same reason and the same shape
 * risk: it is not an actor that can accompany the PCs, it is "something there
 * is to find" — a follower block on its row is leftover shape, not a live
 * follower, however it got there (a stale row re-typed to DISCOVERY, a
 * restored revision, an MCP write). The exclusion is added HERE rather than
 * at any of this predicate's call sites on purpose: `followerOf` must keep
 * reading the block verbatim (below) so the stored shape survives untouched,
 * and every caller that asks "is this a follower" gets the same, single
 * answer instead of re-deriving it. It also restores parity with the server:
 * `app_character_mechanics_open` (supabase-statblock.sql) now excludes
 * `DISCOVERY` too, so a write this predicate would have allowed through the
 * client is one the server would silently refuse anyway. Do not "simplify"
 * this back to a bare `followerOf(c) != null` — that would hand a discovery
 * a live, editable Follower card (and tags) over a block that can never save.
 */
export function isFollower(c: FollowerSource & Pick<Character, 'type'>): boolean {
  return c.type !== 'MENACE' && c.type !== 'DISCOVERY' && followerOf(c) != null;
}
