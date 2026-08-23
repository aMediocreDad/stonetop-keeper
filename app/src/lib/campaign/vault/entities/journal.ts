import type { GmJournal, Wonder } from '../../../../types';
import { htmlToMarkdown, markdownToHtml } from '../../markdown';
import { emitFrontmatter, parseFrontmatter } from '../frontmatter';
import { hoistMentions, injectMentions } from '../mentions';
import { bodyWithStrays, findSection, joinBlocks, knownTitles, section, splitSections } from '../blocks';
import type { VaultContext } from '../context';

/**
 * `GM/Journal.md` — the GM's scratchpad and their open "I wonder…" questions.
 *
 * Wonders are a task list because that is what they are: a question, ticked when
 * play answers it. The optional resolution rides on an indented continuation
 * line, and the id/created pair in an HTML comment that Obsidian does not render.
 */

const WONDERS_TITLE = 'I wonder…';

function writeWonders(wonders: Wonder[]): string {
  return wonders
    .map((w) => {
      const head = `- [${w.resolved ? 'x' : ' '}] ${w.text}`;
      const meta = `      <!-- id=${w.id} created=${w.created_at} -->`;
      const res = w.resolution ? `\n      ${w.resolution}` : '';
      return `${head}${res}\n${meta}`;
    })
    .join('\n');
}

function parseWonders(body: string): Wonder[] {
  const out: Wonder[] = [];
  let current: Wonder | null = null;
  const push = () => {
    if (current) out.push(current);
    current = null;
  };

  for (const line of String(body ?? '').split('\n')) {
    const item = /^\s*-\s+\[([ xX])\]\s?(.*)$/.exec(line);
    if (item) {
      push();
      current = {
        id: '',
        text: item[2].trim(),
        resolved: item[1].toLowerCase() === 'x',
        created_at: '',
      };
      continue;
    }
    if (!current) continue;

    const meta = /<!--\s*id=(\S*)\s+created=(\S*)\s*-->/.exec(line);
    if (meta) {
      current.id = meta[1];
      current.created_at = meta[2];
      continue;
    }
    const cont = line.trim();
    if (cont) current.resolution = current.resolution ? `${current.resolution} ${cont}` : cont;
  }
  push();
  return out;
}

export function writeJournal(j: GmJournal, ctx: VaultContext): string {
  const notes = hoistMentions(htmlToMarkdown(j.notes), ctx);
  const front = emitFrontmatter({
    id: j.id,
    updated: j.updated_at,
    mentions: Object.keys(notes.mentions).length ? notes.mentions : '',
  });
  const body = joinBlocks([
    section(2, 'Notes', notes.md),
    section(2, WONDERS_TITLE, writeWonders(j.wonders ?? [])),
  ]);
  return `${front}\n${body}\n`;
}

const KNOWN_TITLES = knownTitles(['Notes', WONDERS_TITLE]);

export function parseJournal(md: string): GmJournal {
  const { data, body } = parseFrontmatter(md);
  const sections = splitSections(body);
  const mentions = (data.mentions ?? {}) as Record<string, string>;
  const notesAt = sections.findIndex((s) => s.title.toLowerCase() === 'notes');

  return {
    id: String(data.id ?? ''),
    space_id: '',
    notes:
      notesAt < 0
        ? ''
        : markdownToHtml(injectMentions(bodyWithStrays(sections, notesAt, KNOWN_TITLES), mentions)),
    wonders: parseWonders(findSection(sections, WONDERS_TITLE)?.body ?? ''),
    updated_at: String(data.updated ?? ''),
  };
}
