import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * YAML frontmatter, emitted deterministically and parsed leniently.
 *
 * Emission drops `null`/`undefined`/`''` keys entirely rather than writing
 * `key: null`: Obsidian shows every frontmatter key as a property row, and a
 * sheet with fifteen empty rows above it reads as a database record, not a
 * journal entry. Absence and empty are the same thing on the way back in.
 *
 * A real parser is used rather than a hand-rolled one because this reads
 * frontmatter a human has edited in Obsidian — the emission side is constrained
 * and could be hand-rolled, but the parse side faces arbitrary valid YAML.
 */

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

export function emitFrontmatter(data: Record<string, unknown>): string {
  const kept: Record<string, unknown> = {};
  // Insertion order is the caller's declared order, which keeps output byte
  // stable across exports — the idempotence contract depends on it.
  for (const [k, v] of Object.entries(data)) if (!isEmpty(v)) kept[k] = v;
  if (!Object.keys(kept).length) return '';
  return `---\n${stringifyYaml(kept, { lineWidth: 0 }).trimEnd()}\n---\n`;
}

export interface ParsedNote {
  data: Record<string, unknown>;
  body: string;
}

/** Tolerates a missing or malformed block: a note with no frontmatter is all
 *  body, and unparseable YAML yields no data rather than throwing — one bad
 *  note must not fail a whole vault. */
export function parseFrontmatter(md: string): ParsedNote {
  // A BOM ahead of the `---` fence would stop it matching; editors add them.
  const text = String(md ?? '').replace(/^\uFEFF/, '');
  const m = FENCE.exec(text);
  if (!m) return { data: {}, body: text.trim() };

  let data: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { data, body: text.slice(m[0].length).trim() };
}

/** `[[Name]]` / `[[Name|id]]` -> the name. Anything else passes through. */
export function unwrapWikilink(value: unknown): string {
  const s = typeof value === 'string' ? value : '';
  const m = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(s.trim());
  return m ? m[1] : s.trim();
}

export function wikilink(name: string): string {
  return `[[${name}]]`;
}
