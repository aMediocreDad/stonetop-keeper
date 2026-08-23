import type { VaultContext } from './context';
import { slugifyName } from './layout';

/**
 * Mentions, presented the way Obsidian actually reads them.
 *
 * `markdown.ts` serialises a mention span self-containedly as `[[label|id]]`,
 * which round-trips on its own — but Obsidian's wikilink syntax is
 * `[[target|display]]`, so that form renders the raw id as the visible text and
 * links to a note named after the label. Exactly backwards for a vault someone
 * is meant to read.
 *
 * So the vault emits a plain `[[Name]]` — which resolves to the entity's own
 * note — and hoists the ids into the note's `mentions` frontmatter. Reading a
 * vault re-injects them before handing the Markdown back to `markdownToHtml`.
 *
 * NAME, NOT LABEL. The link target is the entity's NOTE name, resolved through
 * the vault context, not the `data-label` the editor froze into the span. A
 * label goes stale the moment the sheet is renamed, and a name holding a `/` or
 * a `#` is filed under a different, sanitised file name (`layout.ts`) — in both
 * cases a label-shaped link points at nothing. Keying the frontmatter by note
 * name also makes the map injective for free: note names are unique across the
 * whole vault, so two mentions can no longer collide onto one entry and send
 * the second one to the first one's sheet.
 *
 * Residual, stated rather than hidden: for a sheet whose note name had to be
 * sanitised or de-duplicated, the mention comes back carrying the NOTE name as
 * its display label rather than the original. The id — the part that decides
 * which sheet it points at — is exact, and the app rewrites the label at the
 * next edit.
 */

const WITH_ID = /\[\[([^\]|\n]+)\|([^\]\n]*)\]\]/g;
const BARE = /\[\[([^\]|\n]+)\]\]/g;

export interface Hoisted {
  md: string;
  mentions: Record<string, string>;
}

export function hoistMentions(md: string, ctx?: VaultContext): Hoisted {
  const mentions: Record<string, string> = {};
  const out = String(md ?? '').replace(WITH_ID, (_all, label: string, id: string) => {
    if (!id) return `[[${label}]]`;
    // A resolved name is safe by construction — `slugifyName` has already
    // stripped everything that would break a wikilink. A LABEL has not: the
    // fallback (a target outside this export, so no note name exists) goes
    // through the same filter, or a name holding a `|` writes `[[Gero|the Hand]]`
    // and reads back as the id "the Hand".
    const name = ctx?.nameById.get(id) ?? slugifyName(label);
    const claimed = mentions[name];
    // Two DIFFERENT entities under one name can only happen for targets outside
    // this export, which have no note name to be unique by. Leave the second one
    // in its self-contained `[[name|id]]` form rather than let the frontmatter
    // decide it is the first one.
    if (claimed && claimed !== id) return `[[${name}|${id}]]`;
    mentions[name] = id;
    return `[[${name}]]`;
  });
  return { md: out, mentions };
}

export function injectMentions(md: string, mentions: Record<string, string> | undefined): string {
  if (!mentions || !Object.keys(mentions).length) return String(md ?? '');
  return String(md ?? '').replace(BARE, (all, label: string) => {
    const id = mentions[label];
    return id ? `[[${label}|${id}]]` : all;
  });
}
