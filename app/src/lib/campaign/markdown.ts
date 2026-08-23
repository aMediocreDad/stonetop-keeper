/**
 * TipTap HTML ↔ Markdown, both directions, pure and DOM-free.
 *
 * WHY THIS EXISTS
 * ---------------
 * `html.ts` next door converts HTML → plain text one way only: it is how the
 * MCP read tools used to hand notes to a model, and it throws away every list,
 * heading and emphasis on the way. This pair is reversible, which is what makes
 * the vault export a backup rather than a printout.
 *
 * WHY A ROUND-TRIP IS PROVABLE HERE AND NOT IN GENERAL
 * ---------------------------------------------------
 * Stored markup is a CLOSED set — `sanitizeHtml.ts`'s allow-list, which tracks
 * the live editor (`StarterKit.configure({ heading: { levels: [2, 3] } })` plus
 * our Mention extension). `SUPPORTED_TAGS` below restates that list, and
 * `__tests__/markdown.test.ts` asserts the two agree, so widening the editor
 * fails the suite instead of silently dropping markup on export.
 *
 * Two tags have no Markdown spelling:
 *   - `<u>` rides through as literal inline HTML, which Markdown permits.
 *   - mention `<span>`s become `[[label|id]]` wikilinks — readable in Obsidian,
 *     and the id survives so a renamed target still resolves on import.
 *
 * HEADINGS LIVE AT LEVELS 5–6, ON PURPOSE
 * ---------------------------------------
 * The vault gives a note's STRUCTURE to headings 2–4 (`## Notes`, `### Stakes`,
 * `#### <improvement>`), and `vault/blocks.ts` splits a note on exactly those.
 * A heading the user typed inside their prose is content, not structure — so an
 * editor h2/h3 is written as `#####`/`######`, which the splitter cannot mistake
 * for a section. Emitting `## ` here instead would let a note containing
 * "## GM Notes" silently promote its own public prose into the GM-only field.
 * Reading is lenient in the other direction: `##`…`######` all come back as
 * h2/h3, so a hand-authored heading still renders.
 *
 * Deliberately hand-rolled, no dependency: the grammar is small and fixed, and
 * this module is reachable from the MCP Worker, where the campaign core's rules
 * forbid a DOM and browser-only packages.
 *
 * NOT a sanitiser. `markdownToHtml` escapes text so authored content cannot
 * inject tags, but anything read back from a vault still goes through
 * `sanitizeRichHtml` before it is rendered.
 */

/** Exactly `sanitizeHtml.ts`'s ALLOWED_TAGS. Kept in step by a test — importing
 *  it directly would pull DOMPurify into the Worker-reachable core. */
export const SUPPORTED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike',
  'code', 'pre', 'blockquote', 'hr', 'a',
  'ul', 'ol', 'li', 'h2', 'h3', 'span',
] as const;

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

/** Entity decoding, `&amp;` LAST so `&amp;lt;` decodes to `&lt;` and not `<`. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Characters that would otherwise be read back as markup. `<` is in the set
 *  because stored text that merely LOOKS like a tag (`&lt;u&gt;x&lt;/u&gt;`)
 *  decodes to `<u>x</u>` here, and would come back as real underline markup. */
function escapeMarkdown(s: string): string {
  return s.replace(/([\\*_[\]`~<])/g, '\\$1');
}

/**
 * Escape a marker that only means something at the START of a line. `-`, `>`,
 * `#` and `1.` are ordinary punctuation mid-sentence and block syntax in column
 * one, so escaping them everywhere (as `escapeMarkdown` does for `*`) would
 * litter every note; escaping them here keeps a paragraph reading "- not a
 * list" a paragraph. A leading `---` is covered by escaping its first dash, and
 * a leading ``` by `escapeMarkdown`'s backtick rule.
 */
function escapeBlockStart(md: string): string {
  return md
    .split('\n')
    .map((line) =>
      line.replace(/^(\s*)(?:([-+>#])|(\d+)\.)/, (_, ws: string, mark?: string, num?: string) =>
        mark ? `${ws}\\${mark}` : `${ws}${num}\\.`,
      ),
    )
    .join('\n');
}

const IS_MENTION = /\bdata-type="mention"/i;
const ATTR = (src: string, name: string): string =>
  new RegExp(`${name}="([^"]*)"`, 'i').exec(src)?.[1] ?? '';

/** Inline HTML → inline Markdown. Operates on the contents of one block. */
function inlineToMarkdown(html: string): string {
  let out = '';
  let rest = html;

  // One scan, longest-lived alternatives first: a mention is a span, and a
  // code span must not have its contents treated as markup. The final
  // alternative is a catch-all for any tag the grammar does not know — its
  // wrapper is dropped and its text kept, rather than leaking raw markup into
  // the vault (which the reader would then escape into visible garbage).
  // Group numbering is load-bearing: each backreference must name its OWN tag
  // group, never the lazy content group beside it — pointing `\4` at content
  // makes the engine backtrack a lazy group against itself and hang.
  //   1 code · 2 link text · 3/4 strong · 5/6 em · 7/8 strike · 9 underline
  const TOKEN =
    /<span\b[^>]*>[\s\S]*?<\/span>|<code>([\s\S]*?)<\/code>|<a\b[^>]*>([\s\S]*?)<\/a>|<(strong|b)>([\s\S]*?)<\/\3>|<(em|i)>([\s\S]*?)<\/\5>|<(s|del|strike)>([\s\S]*?)<\/\7>|<u>([\s\S]*?)<\/u>|<br\s*\/?>|<\/?[a-z][^>]*>/i;

  for (;;) {
    const m = TOKEN.exec(rest);
    if (!m) {
      out += escapeMarkdown(decodeEntities(rest));
      return out;
    }
    out += escapeMarkdown(decodeEntities(rest.slice(0, m.index)));
    const tok = m[0];

    if (/^<span\b/i.test(tok)) {
      if (IS_MENTION.test(tok)) {
        // The editor writes the visible `@Label` INSIDE the span; the attributes
        // are the data. Matching an empty span (which is what `markdownToHtml`
        // used to emit) missed every real mention and leaked the whole span into
        // the note — the reason this alternative is content-agnostic.
        const label = decodeEntities(ATTR(tok, 'data-label'));
        const id = ATTR(tok, 'data-id');
        out += id ? `[[${label}|${id}]]` : `[[${label}]]`;
      } else {
        // A span with no mention marker carries no Markdown meaning: keep the
        // text, drop the wrapper.
        out += inlineToMarkdown(tok.replace(/^<span\b[^>]*>/i, '').replace(/<\/span>$/i, ''));
      }
    } else if (/^<code>/i.test(tok)) {
      out += `\`${decodeEntities(m[1] ?? '')}\``;
    } else if (/^<a\b/i.test(tok)) {
      out += `[${inlineToMarkdown(m[2] ?? '')}](${ATTR(tok, 'href')})`;
    } else if (/^<(strong|b)>/i.test(tok)) {
      out += `**${inlineToMarkdown(m[4] ?? '')}**`;
    } else if (/^<(em|i)>/i.test(tok)) {
      out += `*${inlineToMarkdown(m[6] ?? '')}*`;
    } else if (/^<(s|del|strike)>/i.test(tok)) {
      out += `~~${inlineToMarkdown(m[8] ?? '')}~~`;
    } else if (/^<u>/i.test(tok)) {
      // No Markdown spelling — literal inline HTML, which Markdown allows.
      out += `<u>${inlineToMarkdown(m[9] ?? '')}</u>`;
    } else if (/^<br/i.test(tok)) {
      out += '\\\n'; // Markdown hard break
    }
    // else: an unknown tag. Dropped — its text is outside the token.
    rest = rest.slice(m.index + tok.length);
  }
}

const BLOCK_OPEN = '<(p|h2|h3|ul|ol|blockquote|pre)\\b[^>]*>|<hr\\s*/?>';

/**
 * Where a block that opened at `from` closes, counting nested opens of the same
 * tag. A lazy `<\/tag>` — what this replaces — stops at the FIRST close, which
 * for `<ul><li>a<ul><li>b</li></ul></li></ul>` is the inner one: the outer
 * list's tail was then never scanned and its markup leaked into the note.
 * An unclosed tag yields the rest of the string, which is the lenient reading.
 */
function closeOf(src: string, tag: string, from: number): { innerEnd: number; after: number } {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { innerEnd: m.index, after: re.lastIndex };
  }
  return { innerEnd: src.length, after: src.length };
}

/** The `<li>` chunks of one list, nested lists left inside their own item. */
function itemsOf(inner: string): string[] {
  const out: string[] = [];
  const open = /<li\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(inner)) !== null) {
    const start = m.index + m[0].length;
    const { innerEnd, after } = closeOf(inner, 'li', start);
    out.push(inner.slice(start, innerEnd));
    open.lastIndex = after;
  }
  return out;
}

/**
 * One item's own content and the lists nested inside it. A multi-block item
 * flattens onto its single line: TipTap's list item holds one paragraph, and a
 * lazy continuation line would be ambiguous with the nesting indent for no
 * gain.
 */
function splitItem(item: string): { text: string; nested: { tag: string; inner: string }[] } {
  const nested: { tag: string; inner: string }[] = [];
  const open = /<(ul|ol)\b[^>]*>/gi;
  let own = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(item)) !== null) {
    own += item.slice(cursor, m.index);
    const tag = m[1].toLowerCase();
    const start = m.index + m[0].length;
    const { innerEnd, after } = closeOf(item, tag, start);
    nested.push({ tag, inner: item.slice(start, innerEnd) });
    cursor = after;
    open.lastIndex = after;
  }
  own += item.slice(cursor);
  return { text: htmlToMarkdown(own).replace(/\n+/g, ' ').trim(), nested };
}

/** A list as Markdown lines, two spaces of indent per level of nesting. */
function listToMarkdown(tag: string, inner: string, depth: number): string[] {
  const lines: string[] = [];
  const pad = '  '.repeat(depth);
  itemsOf(inner).forEach((item, i) => {
    const { text, nested } = splitItem(item);
    lines.push(`${pad}${tag === 'ol' ? `${i + 1}.` : '-'} ${text}`);
    for (const child of nested) lines.push(...listToMarkdown(child.tag, child.inner, depth + 1));
  });
  return lines;
}

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return '';
  const src = String(html);
  const blocks: string[] = [];
  const push = (md: string) => {
    if (md.trim()) blocks.push(md);
  };
  // Text that sits BETWEEN or outside blocks. Dropping it (the whole loop used
  // to) lost characters the flattener this replaced had always kept.
  const loose = (frag: string) => push(escapeBlockStart(inlineToMarkdown(frag).trim()));

  // Built per call, never shared: a module-level `/g` regex carries `lastIndex`
  // as mutable state, and this function RECURSES (blockquotes, list items) —
  // the inner call would reset the outer loop's cursor and spin forever.
  const open = new RegExp(BLOCK_OPEN, 'gi');
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = open.exec(src)) !== null) {
    if (m.index > cursor) loose(src.slice(cursor, m.index));
    const tag = (m[1] ?? 'hr').toLowerCase();

    if (tag === 'hr') {
      blocks.push('---');
      cursor = m.index + m[0].length;
      open.lastIndex = cursor;
      continue;
    }

    const innerStart = m.index + m[0].length;
    const { innerEnd, after } = closeOf(src, tag, innerStart);
    const inner = src.slice(innerStart, innerEnd);
    cursor = after;
    open.lastIndex = after;

    if (tag === 'p') push(escapeBlockStart(inlineToMarkdown(inner)));
    else if (tag === 'h2') push(`##### ${inlineToMarkdown(inner)}`);
    else if (tag === 'h3') push(`###### ${inlineToMarkdown(inner)}`);
    else if (tag === 'pre') {
      // Code is verbatim: no escaping, no inline parsing.
      const code = decodeEntities(inner.replace(/<\/?code>/gi, ''));
      push('```\n' + code + '\n```');
    } else if (tag === 'blockquote') {
      push(
        htmlToMarkdown(inner)
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n'),
      );
    } else {
      push(listToMarkdown(tag, inner, 0).join('\n'));
    }
  }

  if (cursor < src.length) loose(src.slice(cursor));
  return blocks.join('\n\n').trim();
}

// ---------------------------------------------------------------------------
// Markdown → HTML
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline Markdown → inline HTML. `***x***` is matched before `**x**`, which is
 *  matched before `*x*`, or a nested pair swallows its own delimiters. The
 *  escape class is the UNION of what `escapeMarkdown` and `escapeBlockStart`
 *  write, or an escaped block marker would come back with its backslash. */
function inlineToHtml(md: string): string {
  let out = '';
  let rest = md;

  const TOKEN =
    /\\([\\*_[\]`~<>#+.-])|`([^`]*)`|\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]|\[([^\]]*)\]\(([^)]*)\)|<u>([\s\S]*?)<\/u>|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|~~([\s\S]+?)~~|\*([\s\S]+?)\*|\\\n/;

  for (;;) {
    const m = TOKEN.exec(rest);
    if (!m) return out + escapeHtml(rest);
    out += escapeHtml(rest.slice(0, m.index));

    if (m[1] !== undefined) out += escapeHtml(m[1]);
    else if (m[2] !== undefined) out += `<code>${escapeHtml(m[2])}</code>`;
    else if (m[3] !== undefined) {
      // The editor's own shape, down to the `@Label` text node: an empty span
      // is a valid mention to TipTap but renders as NOTHING in the app's static
      // reader, so a note read back from a vault would show blanks where its
      // mentions were.
      const label = escapeHtml(m[3]);
      out +=
        `<span data-type="mention" class="mention" data-id="${escapeHtml(m[4] ?? '')}" ` +
        `data-label="${label}">@${label}</span>`;
    } else if (m[5] !== undefined) {
      out += `<a href="${escapeHtml(m[6] ?? '')}">${inlineToHtml(m[5])}</a>`;
    } else if (m[7] !== undefined) out += `<u>${inlineToHtml(m[7])}</u>`;
    else if (m[8] !== undefined) out += `<strong><em>${inlineToHtml(m[8])}</em></strong>`;
    else if (m[9] !== undefined) out += `<strong>${inlineToHtml(m[9])}</strong>`;
    else if (m[10] !== undefined) out += `<s>${inlineToHtml(m[10])}</s>`;
    else if (m[11] !== undefined) out += `<em>${inlineToHtml(m[11])}</em>`;
    else out += '<br>';

    rest = rest.slice(m.index + m[0].length);
  }
}

/** A list line at any indent: `- x`, `1. x`, `  - x`. */
const LIST_LINE = /^(\s*)(?:([-+*])|(\d+)\.)\s+(.*)$/;
const HEADING_LINE = /^(#{2,6})\s+(.*)$/;

interface ListItem {
  depth: number;
  ordered: boolean;
  text: string;
}

/** One list and everything nested under it, from `start`. Returns the HTML and
 *  the index of the first item that is not part of it. */
function buildList(items: ListItem[], start: number, depth: number): [string, number] {
  const { ordered } = items[start];
  const tag = ordered ? 'ol' : 'ul';
  let html = '';
  let i = start;

  while (i < items.length && items[i].depth === depth && items[i].ordered === ordered) {
    let li = `<li>${inlineToHtml(items[i].text)}`;
    i += 1;
    while (i < items.length && items[i].depth > depth) {
      const [child, next] = buildList(items, i, items[i].depth);
      li += child;
      i = next;
    }
    html += `${li}</li>`;
  }
  return [`<${tag}>${html}</${tag}>`, i];
}

export function markdownToHtml(md: string | null | undefined): string {
  if (!md) return '';
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const isBlank = (s: string) => s.trim() === '';

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i += 1; continue; }

    if (line.startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i += 1; // closing fence
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) { out.push('<hr>'); i += 1; continue; }

    // Lenient on the way in: the writer emits content headings at 5–6 (see the
    // module note), but `##` from a hand-edited note or an MCP write is a
    // heading too. Odd depths land on h3, the deeper of the two the editor has.
    const head = HEADING_LINE.exec(line);
    if (head) {
      const tag = head[1].length === 2 || head[1].length === 5 ? 'h2' : 'h3';
      out.push(`<${tag}>${inlineToHtml(head[2])}</${tag}>`);
      i += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${markdownToHtml(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (LIST_LINE.test(line)) {
      const items: ListItem[] = [];
      for (let m = LIST_LINE.exec(lines[i]); i < lines.length && m; m = LIST_LINE.exec(lines[i])) {
        items.push({ depth: Math.floor(m[1].length / 2), ordered: m[3] !== undefined, text: m[4] });
        i += 1;
      }
      // Siblings of a different kind (`- a` then `1. b`) are separate lists, so
      // keep building until every collected item has a home.
      let at = 0;
      while (at < items.length) {
        const [html, next] = buildList(items, at, items[at].depth);
        out.push(html);
        at = next > at ? next : at + 1;
      }
      continue;
    }

    // Paragraph: consecutive lines up to a blank line or the next block start.
    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('>') &&
      !HEADING_LINE.test(lines[i]) &&
      !/^-{3,}$/.test(lines[i].trim()) &&
      !LIST_LINE.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inlineToHtml(para.join('\n'))}</p>`);
  }

  return out.join('');
}
