/**
 * The body vocabulary shared by every note: sections, task lists, bullet lists
 * and hidden identity comments.
 *
 * Task lists are not a stylistic choice. `Trait{label,checked}`,
 * `ThreatPortent{text,done}` and `ImprovementRequirement{text,done}` are all
 * label-plus-ticked pairs, which is exactly what `- [x] label` is: it reads as a
 * sheet, stays tickable in Obsidian, and round-trips without a parser guess.
 */

export interface Section {
  level: number;
  title: string;
  body: string;
}

/** Split a note body into its `##`/`###`/`####` sections, in order. Text before
 *  the first heading is returned under the empty title. */
export function splitSections(body: string): Section[] {
  const lines = String(body ?? '').split('\n');
  const out: Section[] = [];
  let current: Section = { level: 0, title: '', body: '' };
  const buf: string[] = [];
  const flush = () => {
    current.body = buf.join('\n').trim();
    if (current.title || current.body) out.push({ ...current });
    buf.length = 0;
  };

  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && /^(#{2,4})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      current = { level: m[1].length, title: m[2].trim(), body: '' };
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** Direct children of a section: the sub-sections one level down, until a
 *  heading at the same or a shallower level.
 *
 *  A parent index of -1 (a `findIndex` that found nothing) yields no children
 *  rather than throwing: frontmatter can mark a block present — `threat: true` —
 *  while the section itself was deleted by hand in Obsidian, and a throw there
 *  costs the WHOLE note, because `readVault` skips a note it cannot parse. */
export function childSections(sections: Section[], parentIndex: number): Section[] {
  const parent = sections[parentIndex];
  if (!parent) return [];
  const out: Section[] = [];
  for (let i = parentIndex + 1; i < sections.length; i += 1) {
    if (sections[i].level <= parent.level) break;
    if (sections[i].level === parent.level + 1) out.push(sections[i]);
  }
  return out;
}

export function findSection(sections: Section[], title: string): Section | undefined {
  return sections.find((s) => s.title.toLowerCase() === title.toLowerCase());
}

/**
 * A prose section's body, plus any following section whose heading is not one
 * this note's format knows.
 *
 * The app's own headings can no longer collide with these — `markdown.ts` writes
 * an editor h2/h3 at levels 5–6, which `splitSections` does not split on — but
 * someone typing `## Rumours` into a note in Obsidian still cuts the section in
 * two, and the tail would be dropped on the way back. Absorbing unknown
 * headings (heading and all, so the prose keeps its shape) means hand-editing
 * costs nothing.
 */
export function bodyWithStrays(
  sections: Section[],
  index: number,
  isKnown: (title: string) => boolean,
): string {
  const start = sections[index];
  if (!start) return '';
  const parts = [start.body];
  for (let i = index + 1; i < sections.length; i += 1) {
    const s = sections[i];
    if (isKnown(s.title)) break;
    parts.push(`${'#'.repeat(s.level)} ${s.title}`, s.body);
  }
  return parts.filter((p) => p.trim()).join('\n\n').trim();
}

/** `bodyWithStrays` keyed on a fixed list of titles. */
export function knownTitles(titles: readonly string[]): (title: string) => boolean {
  const set = new Set(titles.map((t) => t.toLowerCase()));
  return (title: string) => set.has(title.trim().toLowerCase());
}

export function section(level: number, title: string, body: string): string {
  if (!body.trim()) return '';
  return `${'#'.repeat(level)} ${title}\n\n${body.trim()}\n`;
}

export interface Ticked {
  text: string;
  done: boolean;
}

export function taskList(items: Ticked[]): string {
  return items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
}

export function parseTaskList(body: string): Ticked[] {
  const out: Ticked[] = [];
  for (const line of String(body ?? '').split('\n')) {
    const m = /^\s*-\s+\[([ xX])\]\s?(.*)$/.exec(line);
    if (m) out.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x' });
  }
  return out;
}

export function bulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

export function parseBulletList(body: string): string[] {
  const out: string[] = [];
  for (const line of String(body ?? '').split('\n')) {
    const m = /^\s*-\s+(?!\[[ xX]\])(.*)$/.exec(line);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

/**
 * Identity with no natural prose home — an improvement's slug, a wonder's id.
 * An HTML comment is invisible in Obsidian's preview and degrades to nothing in
 * a plain Markdown reader, so the note reads clean while the value survives.
 */
export function idComment(data: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length ? `<!-- ${parts.join(' ')} -->` : '';
}

export function parseIdComment(body: string): Record<string, string> {
  const m = /<!--\s*([^>]*?)\s*-->/.exec(String(body ?? ''));
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const pair of m[1].split(/\s+/)) {
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

/** Strip the identity comment so it does not leak into a prose field. */
export function withoutIdComment(body: string): string {
  return String(body ?? '')
    .replace(/<!--[^>]*-->/g, '')
    .trim();
}

/** Join note parts, collapsing the blank-line runs that empty sections leave. */
export function joinBlocks(parts: string[]): string {
  return parts
    .filter((p) => p.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
