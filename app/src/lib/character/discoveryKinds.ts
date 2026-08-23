/**
 * The book's six kinds of discovery, from its Discoveries chapter: Clues,
 * Sites, Encounters, Opportunities, Artifacts, Arcana.
 *
 * SINGLE-SELECT, stored in `characters.role`. The book says the categories
 * "aren't formal" and "often overlap", which argues for a multi-select; that
 * was considered and rejected — overlap is rare in practice, a discovery's
 * kind changes more often than it doubles, and when two apply the most
 * relevant one is the one worth filing under. The caveat is honoured by
 * making the field freely editable, not by making it plural.
 *
 * The storage shape has a precedent: `relations.relation_type` is a TEXT
 * column holding a closed id set, read through `getRelationType()` with an
 * `autre` fallback. This module is the same contract with `null` as the
 * fallback, because "unfiled" is a real state rather than an "other" kind.
 *
 * Ids are ENGLISH and lowercase. There are no legacy values to preserve here
 * (the type is new), so this does not repeat the French-enum problem the
 * PJ/PNJ/GROUPE/MENACE codes left behind.
 *
 * NO stamps in this module. It sits in `lib/shared.ts`'s transitive graph
 * (`render/prose.ts` reads the labels for the MCP brief), and that graph must
 * stay free of Vite asset imports and of the `@` alias for values. The stamps
 * live in `components/character/discoveryKindIcons.ts` — the same split
 * `monsterKinds.ts` / `monsterKindIcons.ts` already uses.
 *
 * SEVEN kinds, and the book has six. `revelation` is OURS. The chapter treats
 * a revelation as a first-class prep object — "start with the revelation, the
 * thing you want the PCs to potentially learn. Work backwards from there"
 * — but files it under Clues rather than beside them. Promoting it to
 * a kind is what lets a clue POINT at one (a node, not a text field) and lets
 * a revelation's sheet count the clues aimed at it, which is the book's own
 * "at least one clue, ideally two or three". So this list is this
 * app's filing system, not the chapter's headings. Do not trim it back to six.
 */
export type DiscoveryKind =
  | 'clue' | 'revelation' | 'site' | 'encounter' | 'opportunity' | 'artifact' | 'arcanum';

/**
 * Display order for the sheet dropdown and the dashboard sub-filter:
 * ALPHABETICAL, by the owner's call (2026-08-21). This was the book chapter's
 * own order — clue, revelation, site, encounter, opportunity, artifact,
 * arcanum — on the reasoning that a GM who knows the chapter finds the entry
 * where they expect it. In practice the chapter order reads as arbitrary to
 * anyone not holding the book, and a seven-item list is scanned, not
 * remembered. Do not "restore" the chapter order without asking.
 *
 * `label` is the EN fallback, for consumers with no React context (the MCP's
 * prose renderer, the vault export). `labelKey` is what the UI uses.
 */
export const DISCOVERY_KINDS: ReadonlyArray<{
  id: DiscoveryKind;
  label: string;
  labelKey: string;
}> = [
  { id: 'arcanum',     label: 'Arcanum',     labelKey: 'discovery.arcanum' },
  { id: 'artifact',    label: 'Artifact',    labelKey: 'discovery.artifact' },
  { id: 'clue',        label: 'Clue',        labelKey: 'discovery.clue' },
  { id: 'encounter',   label: 'Encounter',   labelKey: 'discovery.encounter' },
  { id: 'opportunity', label: 'Opportunity', labelKey: 'discovery.opportunity' },
  { id: 'revelation',  label: 'Revelation',  labelKey: 'discovery.revelation' },
  { id: 'site',        label: 'Site',        labelKey: 'discovery.site' },
];

const BY_ID = new Map(DISCOVERY_KINDS.map((k) => [k.id as string, k]));

/**
 * The subtype stored in `role`, or `null` for an empty or unrecognised value.
 *
 * `null` is not an error path. The column is `NOT NULL DEFAULT ''` and
 * `create_character` coalesces a missing key to `''`, so a discovery created
 * without a choice genuinely has no kind — the create dialog does not force
 * one. Callers render the neutral stamp and the bare label "Discovery" rather
 * than guessing. It never throws: a restored revision may carry another
 * type's role text ("Blessed · Initiate") on a re-typed row.
 */
export function getDiscoveryKind(role: string | undefined): DiscoveryKind | null {
  if (!role) return null;
  return BY_ID.get(role)?.id ?? null;
}

/** EN display label for a stored `role`, or `'Discovery'` when unfiled.
 *  For consumers with no `t()` — the MCP brief and the vault export. */
export function discoveryKindLabel(role: string | undefined): string {
  const kind = getDiscoveryKind(role);
  return kind ? BY_ID.get(kind)!.label : 'Discovery';
}
