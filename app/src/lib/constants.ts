import type { CharacterType } from '../types';

export interface RelationType {
  id: string;
  /** EN fallback label. Use `useRelationLabel(id)` in UI to get translated. */
  label: string;
  /** i18n key under `relation.*`. */
  labelKey: string;
  /** Edge colour in the graph. */
  color: string;
}

export const RELATION_TYPES: RelationType[] = [
  { id: 'ami',          label: 'Friend / Ally',  labelKey: 'relation.friend',       color: '#5A8C5A' },
  { id: 'famille',      label: 'Family',         labelKey: 'relation.family',       color: '#4A6FA5' },
  { id: 'mentor',       label: 'Mentor',         labelKey: 'relation.mentor',       color: '#7B5DAA' },
  { id: 'compagnon',    label: 'Companion',      labelKey: 'relation.companion',    color: '#3F8B8B' },
  { id: 'rival',        label: 'Rival',          labelKey: 'relation.rival',        color: '#C77744' },
  { id: 'ennemi',       label: 'Enemy',          labelKey: 'relation.enemy',        color: '#9B3A2D' },
  { id: 'romance',      label: 'Romance',        labelKey: 'relation.romance',      color: '#C25A77' },
  { id: 'connaissance', label: 'Acquaintance',   labelKey: 'relation.acquaintance', color: '#999088' },
  { id: 'membre',       label: 'Member',         labelKey: 'relation.member',       color: '#A08A5A' },
  // Structural, not social. All ten types above describe a bond between
  // people; filing "this clue points at that revelation" as *Acquaintance* is
  // nonsense. The colours are one family — a verdigris/slate/umber set — so a
  // lead reads as a different KIND of edge at a glance, not just a different
  // label. `leads-to` shares DISCOVERY_NODE_COLOR (lib/graphPalette) on
  // purpose: it is the discovery's own edge.
  { id: 'leads-to',     label: 'Leads to',       labelKey: 'relation.leadsTo',      color: '#2F6D72' },
  { id: 'found-with',   label: 'Found with',     labelKey: 'relation.foundWith',    color: '#6B7F8C' },
  { id: 'concerns',     label: 'Concerns',       labelKey: 'relation.concerns',     color: '#7A6A55' },
  // Custody, not circumstance: `found-with` is the artifact and the corpse it
  // was interred with, `held-by` is who HAS it. Kept apart deliberately — the
  // promoted slot for an artifact/arcanum is possession, and collapsing the
  // two would make "interred beside" and "carried by" the same fact.
  { id: 'held-by',       label: 'Possessed by',  labelKey: 'relation.heldBy',        color: '#8A6A4F' },
  // The encounter's subject — the book's first question about one, "who/what
  // is the encounter with?". NOT a relabelled `leads-to`: its subject is
  // not something it leads to, and one type reading differently per kind would
  // change what a stored row MEANS when a discovery is re-filed.
  { id: 'encounter-with', label: 'Encounter with', labelKey: 'relation.encounterWith', color: '#4F7A6A' },
  { id: 'autre',        label: 'Other',          labelKey: 'relation.other',        color: '#1B1B1B' },
];


/** Map id → RelationType pour lookup O(1). */
export const RELATION_TYPES_BY_ID: Record<string, RelationType> = Object.fromEntries(
  RELATION_TYPES.map((r) => [r.id, r])
);

/** Retourne le RelationType pour un id, fallback `autre`. */
export function getRelationType(id: string | undefined): RelationType {
  if (!id) return RELATION_TYPES_BY_ID.autre;
  return RELATION_TYPES_BY_ID[id] ?? RELATION_TYPES_BY_ID.autre;
}

/**
 * Migration douce : ancien `relation_type` en texte libre → id fermé.
 * Mapping par mots-clés FR. Fallback sur `autre`.
 */
export function migrateRelationType(legacy: string | undefined): string {
  if (!legacy) return 'autre';
  if (RELATION_TYPES_BY_ID[legacy]) return legacy; // déjà migré
  const t = legacy.toLowerCase();
  if (/(ami|alli[ée]|allie|compagnon)/.test(t)) {
    if (/compagnon/.test(t)) return 'compagnon';
    return 'ami';
  }
  if (/(famille|fr[èe]re|s[oœ]ur|p[èe]re|m[èe]re|fils|fille|cousin|oncle|tante)/.test(t)) return 'famille';
  if (/(mentor|ma[îi]tre|prot[ée]g[ée]|protege|apprenti)/.test(t)) return 'mentor';
  if (/(rival|m[ée]fiance|m[ée]fiant|jaloux|concurrent)/.test(t)) return 'rival';
  if (/(ennemi|antagonist|adversaire|haine)/.test(t)) return 'ennemi';
  if (/(amour|amant|amante|romance|fianc[ée]|conjoint|[ée]poux|[ée]pouse)/.test(t)) return 'romance';
  if (/(connaissance|voisin|client|connait)/.test(t)) return 'connaissance';
  return 'autre';
}

/**
 * The relation types whose meaning is STRUCTURAL rather than social.
 * Stored in the same open TEXT column and resolved through the same
 * `getRelationType` fallback as the ten social ones — nothing existing
 * changes shape.
 */
export const STRUCTURAL_RELATION_IDS: readonly string[] = [
  'leads-to', 'found-with', 'concerns', 'held-by', 'encounter-with',
];

const STRUCTURAL = new Set(STRUCTURAL_RELATION_IDS);

/** The structural types a MENACE pair may use: half of the standing "relations
 *  can't express how threats connect" complaint. Possession and encounter
 *  subjects belong to discoveries, and `found-with` is about objects. */
const MENACE_STRUCTURAL = new Set<string>(['leads-to', 'concerns']);

/**
 * Which types the picker offers for a given pair of endpoints.
 *
 * The rules, in the order they are tested:
 *  - An UNKNOWN end (the other sheet has not loaded) offers everything.
 *    Narrowing on missing data would hide the right answer with no way for the
 *    user to tell why.
 *  - A DISCOVERY at either end offers the five structural types and *Other*,
 *    and none of the social ten: an artifact has no romances.
 *  - A MENACE at either end adds the `MENACE_STRUCTURAL` allow-list
 *    (`leads-to` and `concerns`) to the social ten. That is half of the
 *    standing "relations can't express how threats connect" complaint, closed
 *    as a side effect. `found-with`, `held-by`, and `encounter-with` stay out
 *    — they are about objects, possession, and encounter subjects, none of
 *    which mean anything on a threat.
 *  - Anything else: the social ten, exactly as before this existed.
 *
 * `keepId` is the value already STORED on the relation being edited. A
 * relation whose endpoints later change type degrades to a labelled edge
 * rather than an error (the same tolerance `migrateRelationType` provides), so
 * the edit select must keep showing what is stored instead of going blank —
 * the display lie this repo forbids itself everywhere else. An unrecognised
 * `keepId` is ignored: it already renders as *Other* through
 * `getRelationType`, and synthesising an option for it would write a
 * different value than the one displayed.
 *
 * Returned in RELATION_TYPES order, always — the sheet groups its bonds by
 * that rank (`RELATION_TYPE_RANK`), so a picker in another order would
 * disagree with the list underneath it.
 */
export function relationTypesForPair(
  fromType: CharacterType | undefined,
  toType: CharacterType | undefined,
  keepId?: string,
): RelationType[] {
  const unknownEnd = fromType === undefined || toType === undefined;
  const hasDiscovery = fromType === 'DISCOVERY' || toType === 'DISCOVERY';
  const hasMenace = fromType === 'MENACE' || toType === 'MENACE';
  return RELATION_TYPES.filter((rt) => {
    if (unknownEnd) return true;
    if (rt.id === keepId) return true;
    if (hasDiscovery) return STRUCTURAL.has(rt.id) || rt.id === 'autre';
    // An ALLOW-LIST, not an exclusion. This arm used to read
    // `hasMenace && rt.id !== 'found-with'`, which silently widened every time
    // a structural type was added: `held-by` and `encounter-with` would have
    // started appearing on threat pairs, where neither means anything.
    if (STRUCTURAL.has(rt.id)) return hasMenace && MENACE_STRUCTURAL.has(rt.id);
    return true;
  });
}

export const APP_NAME = 'Ink & Stone';

export const STONETOP_PLAYBOOK_LOCATIONS: { name: string; color: string }[] = [
  { name: 'Stonetop',       color: '#7AA177' }, // vert mousse
  { name: 'Marshedge',      color: '#7DA1B0' }, // bleu marais
  { name: "Gordin's Delve", color: '#C8945C' }, // ocre cuivre
  { name: 'Steplands',      color: '#C97C6B' }, // rouge brique
  { name: 'Lygos',          color: '#D4A84B' }, // or doré
  { name: 'Manmarch',       color: '#8E6BAA' }, // violet pourpre
];

/** Couleur fallback gris parchemin pour personnage sans lieu. */
export const FALLBACK_LOCATION_COLOR = '#9C9385';

/** Palette par défaut proposée dans le color-picker pour créer un nouveau lieu. */
export const DEFAULT_LOCATION_PALETTE: string[] = [
  '#7AA177', // vert mousse
  '#7DA1B0', // bleu marais
  '#C8945C', // ocre cuivre
  '#C97C6B', // rouge brique
  '#D4A84B', // or doré
  '#8E6BAA', // violet pourpre
  '#5A8C5A', // vert sage
  '#4A6FA5', // bleu indigo
  '#C25A77', // rose vieilli
  '#3F8B8B', // sarcelle
  '#7B5DAA', // violet sagesse
  '#9C9385', // gris parchemin
];
