// Relative imports on purpose (see discoveryBlock.ts): this module is reachable
// from lib/shared.ts, which the MCP Worker builds.
import type { Character, Relation } from '../../types';
import { getDiscoveryKind, type DiscoveryKind } from './discoveryKinds';

/**
 * The relation each discovery kind PROMOTES above its ordinary bonds, and how
 * the two ends read it. The generalisation of what `leads-to` was alone.
 *
 * `cap` is a UI affordance ONLY. A concurrent client or an MCP write can store
 * a second possession, and when that happens both rows render — hiding one
 * would be the display lie this repo forbids itself everywhere else.
 */
export interface PromotedRelationConfig {
  /** The relation_type promoted for this kind. */
  type: string;
  /** Heading on the discovery's own sheet. Unused when `outgoing` is false. */
  outgoingKey: string;
  /** Heading on the sheet at the other end. */
  incomingKey: string;
  /** Shown in place of the list when the outgoing slot is empty. Per-kind for
   *  the same reason the headings are: a generic "Nothing yet." under five
   *  differently-named sections is exactly the flattening this task exists to
   *  undo. Read off the sheet's OWN outgoing config only — never off a merged
   *  incoming group, whose config is whichever kind was seen first. */
  emptyKey: string;
  /** How many the UI offers to ADD. `Infinity` for many. */
  cap: number;
  /** false for a kind that only ever receives: a revelation is pointed AT. */
  outgoing: boolean;
}

const LEADS: PromotedRelationConfig = {
  type: 'leads-to',
  outgoingKey: 'character.leadsTo',
  incomingKey: 'character.leadsHere',
  emptyKey: 'character.noLeads',
  cap: Infinity,
  outgoing: true,
};

/**
 * A clue POINTS TO its revelation — the chapter's own verb ("Clues point the
 * PCs towards some sort of knowledge, conclusion, or revelation"), and
 * the reason the heading differs from a site's plain "Leads to".
 */
const POINTS_TO: PromotedRelationConfig = {
  ...LEADS,
  outgoingKey: 'character.pointsTo',
  incomingKey: 'character.cluesHere',
  emptyKey: 'character.noPointsTo',
};

/** Receive-only: a revelation is what clues aim at. Prep works backwards from
 *  it, so its sheet counts what points here and offers nothing outgoing. */
const REVELATION: PromotedRelationConfig = {
  ...POINTS_TO,
  outgoing: false,
};

const HELD_BY: PromotedRelationConfig = {
  type: 'held-by',
  outgoingKey: 'character.possessedBy',
  incomingKey: 'character.possesses',
  emptyKey: 'character.noHolder',
  // One holder. An artifact in two pockets is a data error, not a fact.
  cap: 1,
  outgoing: true,
};

const ENCOUNTER_WITH: PromotedRelationConfig = {
  type: 'encounter-with',
  outgoingKey: 'character.encounterWith',
  incomingKey: 'character.encounters',
  emptyKey: 'character.noEncounterWith',
  cap: Infinity,
  outgoing: true,
};

const BY_KIND: Record<DiscoveryKind, PromotedRelationConfig> = {
  clue: POINTS_TO,
  revelation: REVELATION,
  site: LEADS,
  encounter: ENCOUNTER_WITH,
  opportunity: LEADS,
  artifact: HELD_BY,
  arcanum: HELD_BY,
};

/** The config for a stored `role`. An unfiled or unrecognised kind keeps the
 *  behaviour a discovery has had since the feature shipped: a plain lead. */
export function promotedConfigFor(role: string | undefined): PromotedRelationConfig {
  const kind = getDiscoveryKind(role);
  return kind ? BY_KIND[kind] : LEADS;
}

export interface PromotedGroup {
  config: PromotedRelationConfig;
  /** What identifies a group: the i18n key of the HEADING it renders under,
   *  not its relation type. A clue and a site both promote `leads-to` but
   *  read differently at the far end ("Clues pointing here" vs "What leads
   *  here"), so keying groups on `config.type` merged them and let whichever
   *  arrived first label the other. */
  groupKey: string;
  /** Ids at the other end, deduped, in the order encountered. */
  otherIds: string[];
}

export interface PromotedRelations {
  /** id -> the groups where this row is the discovery (the `from` end). At most
   *  one, since a kind promotes one type — a Map of arrays for symmetry. */
  outgoing: Map<string, PromotedGroup[]>;
  /** id -> the groups where this row is pointed at. Several are possible: an
   *  NPC can be a clue's revelation AND hold an artifact AND be an
   *  encounter's subject. */
  incoming: Map<string, PromotedGroup[]>;
  /** Every relation consumed above. The bonds list excludes these, or one row
   *  is listed twice on the same sheet. */
  promotedRelationIds: Set<string>;
}

type CharLike = Pick<Character, 'id' | 'type' | 'role'>;
type RelLike = Pick<Relation, 'id' | 'from_character_id' | 'to_character_id' | 'relation_type'>;

function push(
  map: Map<string, PromotedGroup[]>,
  key: string,
  config: PromotedRelationConfig,
  otherId: string,
  /** What identifies a group: its HEADING, not its relation type. A clue and a
   *  site both promote `leads-to` but read differently at the far end
   *  ("Clues pointing here" vs "What leads here"), so keying on type merged
   *  them and let whichever arrived first label the other. */
  groupKey: string,
): void {
  let groups = map.get(key);
  if (!groups) { groups = []; map.set(key, groups); }
  let group = groups.find((g) => g.groupKey === groupKey);
  if (!group) { group = { config, groupKey, otherIds: [] }; groups.push(group); }
  // Dedup here rather than at render time: two relations on one pair are
  // possible via concurrent clients, and a repeated id repeats a React key.
  if (!group.otherIds.includes(otherId)) group.otherIds.push(otherId);
}

export function resolvePromotedRelations(
  characters: CharLike[],
  relations: RelLike[],
): PromotedRelations {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const outgoing = new Map<string, PromotedGroup[]>();
  const incoming = new Map<string, PromotedGroup[]>();
  const promotedRelationIds = new Set<string>();

  for (const r of relations) {
    const from = byId.get(r.from_character_id);
    // VALIDITY: the `from` end is a DISCOVERY whose own kind promotes exactly
    // this type. An artifact's `leads-to` therefore stays an ordinary bond —
    // its promoted slot is possession.
    if (!from || from.type !== 'DISCOVERY') continue;
    if (!byId.has(r.to_character_id)) continue; // dangling — leave it inert
    const config = promotedConfigFor(from.role);
    if (!config.outgoing || r.relation_type !== config.type) continue;

    push(outgoing, r.from_character_id, config, r.to_character_id, config.outgoingKey);
    push(incoming, r.to_character_id, config, r.from_character_id, config.incomingKey);
    // BOTH relation ids on a duplicated pair: the bonds list must exclude each
    // of them, or the duplicate reappears down there instead.
    promotedRelationIds.add(r.id);
  }

  return { outgoing, incoming, promotedRelationIds };
}
