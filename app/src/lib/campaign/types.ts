import type {
  CampaignMap,
  Character,
  DiscoveryBlock,
  GmJournal,
  Location,
  MapPin,
  Relation,
  Season,
  Steading,
  ThreatSheet,
  Timeline,
  ToneAndContent,
  Trait,
} from '../../types';

/**
 * Raw RPC payloads, as handed to `traverse()`. Today the MCP Worker is the
 * only producer (its own RPC layer); a browser caller — the future export —
 * would fill the same bag from `db.ts`. `maps`/`mapPins`/`gmJournal` are
 * optional so a producer without that access can omit them and the traversal
 * still resolves.
 */
export interface RawCampaignData {
  characters: Character[];
  locations: Location[];
  relations: Relation[];
  timeline: Timeline | null;
  maps?: CampaignMap[];
  mapPins?: MapPin[];
  gmJournal?: GmJournal | null;
  toneAndContent?: ToneAndContent | null;
}

/** `pc`/`npc`/`group`/`threat`/`discovery` map onto `Character.type`
 *  PJ/PNJ/GROUPE/MENACE/DISCOVERY. */
export type CharacterKind = 'pc' | 'npc' | 'group' | 'threat' | 'discovery';
export type EntityKind = CharacterKind | 'location';

export interface ResolvedRelation {
  id: string;
  /** `relation_type` id, e.g. 'ami'. */
  type: string;
  /** Human label from RELATION_TYPES, e.g. 'Friend / Ally'. */
  typeLabel: string;
  detail: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  gmOnly: boolean;
}

export interface ResolvedCharacter {
  id: string;
  kind: CharacterKind;
  name: string;
  /** Raw `role` string, as stored. */
  role: string;
  /** Playbook display name ('Blessed') or null; derived from `role`. */
  playbook: string | null;
  /** `role` with the playbook prefix removed. */
  roleRest: string;
  locationName: string | null;
  /** Instinct effectif (colonne, repli threat.instinct) — sans le « to ». */
  instinct: string;
  notes: string;
  gmNotes: string;
  tags: string[];
  traits: Trait[];
  gmOnly: boolean;
  threat: ThreatSheet | null;
  /** Discovery-kind fields (tier, the GM-held pair, moves, tracks). Null for
   *  every non-DISCOVERY character and for a DISCOVERY with no block stored. */
  discovery: DiscoveryBlock | null;
  /** Names of groups this character belongs to. */
  memberOf: string[];
  /** Names of members — non-empty only for `kind: 'group'`. */
  members: string[];
  /** Non-membership relations with this character at either end. */
  relations: ResolvedRelation[];
}

export interface ResolvedLocation {
  id: string;
  name: string;
  description: string;
  notes: string;
  gmNotes: string;
  tags: string[];
  gmOnly: boolean;
  steading: Steading | null;
  /** Names of characters whose `location` is this one. */
  inhabitants: string[];
}

export interface ResolvedSeason {
  year: number;
  season: Season;
  strand: 'player' | 'gm';
  title: string;
  body: string;
}

export interface ResolvedPin {
  id: string;
  /** Linked entity's name, or the pin's free label. */
  name: string;
  /** Id of the linked character/location, if the pin is tied to a sheet. */
  characterId: string | null;
  locationId: string | null;
  note: string;
  /** Rough position in words ('north-west', 'center'), from the 0..1 x/y. */
  position: string;
  gmOnly: boolean;
}

export interface ResolvedMap {
  id: string;
  name: string;
  description: string;
  /** Name of the location this map depicts, if linked. */
  locationName: string | null;
  gmOnly: boolean;
  pins: ResolvedPin[];
}

export interface ResolvedWonder {
  text: string;
  resolved: boolean;
  resolution: string;
}

export interface CampaignGraph {
  now: { year: number | null; season: Season | null };
  characters: ResolvedCharacter[];
  locations: ResolvedLocation[];
  /** Non-membership relations only; membership is on the characters. */
  relations: ResolvedRelation[];
  /** Relation ids consumed as group membership. */
  membershipRelationIds: string[];
  /** Ascending by year, then spring→winter; player strand before gm. */
  chronicle: ResolvedSeason[];
  /** Empty when the producer supplied no `maps`/`mapPins`. */
  maps: ResolvedMap[];
  /** Null when the producer's token had no GM access (or none saved). */
  journal: { notes: string; wonders: ResolvedWonder[] } | null;
  /** Unlike `journal`, not role-gated: present for every producer that saved
   *  one, GM or player alike. Null only means the table never wrote it. */
  toneAndContent: { notes: string } | null;
}

/**
 * A renderer turns the resolved graph into text. Adding an export means adding
 * an implementation here — never editing `traverse.ts` or `CampaignGraph`.
 */
export interface CampaignRenderer<Opts = unknown> {
  readonly id: string;
  render(graph: CampaignGraph, opts?: Opts): string;
}
