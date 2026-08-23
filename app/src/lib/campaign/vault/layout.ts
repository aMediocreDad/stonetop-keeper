/**
 * Where every file in an exported vault lives, and what it is called.
 *
 * Note names are the entity's own name, because that is what a `[[wikilink]]`
 * targets and what Obsidian rewrites when you rename a note. The stable `id`
 * stays in frontmatter, so renaming in Obsidian survives re-import.
 */

export const FOLDERS = {
  characters: 'Characters',
  // Discoveries are `characters` rows, but a vault is read by a person: a
  // folder of clues and artifacts beside the cast is the shape a GM expects,
  // and Obsidian's own navigation is folder-first. Note NAMES stay unique
  // vault-wide (see write.ts buildContext) — Obsidian resolves `[[Name]]`
  // across folders, so the pool is not per-folder.
  discoveries: 'Discoveries',
  locations: 'Locations',
  chronicle: 'Chronicle',
  maps: 'Maps',
  mapImages: 'Maps/images',
  gm: 'GM',
  views: 'Views',
} as const;

export const MANIFEST_PATH = 'ink-and-stone.yaml';
export const RELATIONS_PATH = 'Relations.md';
export const README_PATH = 'README.md';
export const JOURNAL_PATH = `${FOLDERS.gm}/Journal.md`;
/** Vault root, not `GM/`: the agreement is the whole table's, not the GM's. */
export const TONE_AND_CONTENT_PATH = 'Tone & content.md';

/** Windows/macOS-hostile characters, plus the ones that would break a wikilink. */
const HOSTILE = /[/\\:*?"<>|[\]#^]/g;

/** Filesystem-safe form of a display name. Never empty — an unnamed entity
 *  still needs a file, and "Untitled" is better than a bare id suffix. */
export function slugifyName(name: string): string {
  const cleaned = (name ?? '')
    .replace(HOSTILE, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .trim();
  return cleaned || 'Untitled';
}

/**
 * A unique note name within one folder. Collisions get a short id suffix rather
 * than a counter, so the name is stable across exports: a counter would
 * reshuffle when an earlier entity is deleted, and every wikilink pointing at it
 * would rot.
 *
 * `taken` is mutated by the caller (add the returned name) — this function only
 * reads it.
 */
export function noteName(name: string, id: string, taken: Set<string>): string {
  const base = slugifyName(name);
  if (!taken.has(base)) return base;
  return `${base} (${(id ?? '').slice(0, 8)})`;
}
