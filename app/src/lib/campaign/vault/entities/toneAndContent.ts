import type { ToneAndContent } from '../../../../types';
import { htmlToMarkdown, markdownToHtml } from '../../markdown';
import { emitFrontmatter, parseFrontmatter } from '../frontmatter';
import { hoistMentions, injectMentions } from '../mentions';
import type { VaultContext } from '../context';

/**
 * `Tone & content.md` — the table's shared agreement, one flowing note.
 *
 * No sections, unlike `journal.ts`: the record is a single field whose
 * structure lives in the headings the table wrote. Round-tripping it through
 * `splitSections` would impose a schema the app deliberately does not have.
 */
export function writeToneAndContent(r: ToneAndContent, ctx: VaultContext): string {
  const notes = hoistMentions(htmlToMarkdown(r.notes), ctx);
  const front = emitFrontmatter({
    id: r.id,
    updated: r.updated_at,
    mentions: Object.keys(notes.mentions).length ? notes.mentions : '',
  });
  return `${front}\n${notes.md}\n`;
}

export function parseToneAndContent(md: string): ToneAndContent {
  const { data, body } = parseFrontmatter(md);
  const mentions = (data.mentions ?? {}) as Record<string, string>;
  return {
    id: String(data.id ?? ''),
    space_id: '',
    notes: markdownToHtml(injectMentions(body.trim(), mentions)),
    updated_at: String(data.updated ?? ''),
  };
}
