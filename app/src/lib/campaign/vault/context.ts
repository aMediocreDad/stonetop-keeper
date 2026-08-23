/**
 * The id ↔ note-name lookups every entity function needs in both directions:
 * writing turns an id into a `[[wikilink]]`, reading turns the link back.
 */
export interface VaultContext {
  /** entity id -> note name (no extension). */
  nameById: Map<string, string>;
  /** note name -> entity id. */
  idByName: Map<string, string>;
  /**
   * Which kind an id belongs to. A map pin's wikilink looks identical whether it
   * names a character or a location, but the row stores them in different
   * columns — without these the pin would be filed under the wrong one.
   */
  characterIds?: Set<string>;
  locationIds?: Set<string>;
  /**
   * Map id -> note name. Deliberately NOT in `nameById`: maps share the vault's
   * one pool of note names (Obsidian resolves `[[Name]]` vault-wide) but they
   * are not link targets, and putting them in the target index would let a pin
   * whose label happens to name a map resolve to the map's id.
   */
  mapNames?: Map<string, string>;
}

export function emptyContext(): VaultContext {
  return {
    nameById: new Map(),
    idByName: new Map(),
    characterIds: new Set(),
    locationIds: new Set(),
    mapNames: new Map(),
  };
}

/**
 * A wikilink when the target is in this export, the raw id when it is not.
 *
 * A player-role export can hold a character whose `location` is a GM-only place,
 * or a pin bound to a hidden sheet: there is no note to point at, and inventing
 * one would fabricate content. The raw id keeps the value intact, and a GM
 * re-importing into the original space resolves it.
 */
export function linkOrId(ctx: VaultContext, id: string): string {
  const name = ctx.nameById.get(id);
  return name ? `[[${name}]]` : id;
}

/** Inverse of `linkOrId`: a wikilink resolves by name, anything else is already
 *  an id (or a name Obsidian renamed, which the importer matches leniently). */
export function resolveRef(ctx: VaultContext, value: string): string {
  const m = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(String(value ?? '').trim());
  if (!m) return String(value ?? '').trim();
  return ctx.idByName.get(m[1]) ?? m[1];
}
