import type { Season, SeasonEntry, TimelineEntry, TimelineStrand } from '../../../../types';
import { htmlToMarkdown, markdownToHtml } from '../../markdown';
import { normalizeSeason } from '../../../timeline/seasonEntry';
import { emitFrontmatter, parseFrontmatter } from '../frontmatter';
import { hoistMentions, injectMentions } from '../mentions';
import { bodyWithStrays, joinBlocks, splitSections } from '../blocks';
import type { VaultContext } from '../context';

/**
 * One file per year per strand: `Chronicle/0847.md` and `0847 (GM).md`.
 *
 * Splitting the strands into separate files rather than nesting the GM one keeps
 * the plum layer trivially separable — you can hand someone the vault minus the
 * `(GM)` files without a parser.
 *
 * Filenames zero-pad the year so they sort in Obsidian's file list; the real
 * number lives in frontmatter, so a five-digit year is not corrupted by the
 * padding.
 *
 * Season `rev` counters are deliberately dropped: they are server-owned
 * compare-and-swap state, and an importer re-derives them.
 */

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const TITLE_CASE: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export function chronicleFileName(year: number, strand: TimelineStrand): string {
  const padded = String(Math.abs(year)).padStart(4, '0');
  const signed = year < 0 ? `-${padded}` : padded;
  return strand === 'gm' ? `${signed} (GM)` : signed;
}

/**
 * Normalised on the way out through the CANONICAL normaliser, not a local copy:
 * a legacy raw-string season becomes a titleless entry, which is what the app
 * writes at the next save anyway. Hand-rolling this is how a second reading of
 * the same legacy shape drifts from the first — the same mistake that crashed
 * the export on a threat sheet whose `stakes` were still an HTML string.
 */
function asEntry(stored: TimelineEntry[Season]): SeasonEntry | null {
  if (stored === undefined || stored === null) return null;
  const e = normalizeSeason(stored);
  if (!e.body && !e.title) return null;
  return { title: e.title ?? '', body: e.body };
}

export function writeChronicleYear(
  year: number,
  strand: TimelineStrand,
  entry: TimelineEntry,
  ctx: VaultContext,
): string {
  const mentions: Record<string, string> = {};
  const parts: string[] = [];

  for (const season of SEASONS) {
    const e = asEntry(entry[season]);
    if (!e) continue;
    const hoisted = hoistMentions(htmlToMarkdown(e.body), ctx);
    Object.assign(mentions, hoisted.mentions);
    if (!hoisted.md.trim() && !e.title) continue;
    const heading = e.title ? `## ${TITLE_CASE[season]} — ${e.title}` : `## ${TITLE_CASE[season]}`;
    parts.push(`${heading}\n\n${hoisted.md.trim()}\n`);
  }

  const front = emitFrontmatter({
    year,
    strand,
    mentions: Object.keys(mentions).length ? mentions : '',
  });
  return `${front}\n${joinBlocks(parts)}\n`;
}

export interface ParsedChronicleYear {
  year: number;
  strand: TimelineStrand;
  entry: TimelineEntry;
}

export function parseChronicleYear(md: string): ParsedChronicleYear {
  const { data, body } = parseFrontmatter(md);
  const mentions = (data.mentions ?? {}) as Record<string, string>;
  const sections = splitSections(body);
  const entry: TimelineEntry = {};

  // A season heading is `## Spring` or `## Spring — <title>`; anything else at
  // this level is prose someone typed into the year note by hand, and belongs to
  // the season it sits under.
  const isSeasonHeading = (title: string): boolean =>
    SEASONS.some((s) => {
      const label = TITLE_CASE[s].toLowerCase();
      const t = title.trim().toLowerCase();
      return t === label || t.startsWith(`${label} — `);
    });

  for (const season of SEASONS) {
    const label = TITLE_CASE[season].toLowerCase();
    const at = sections.findIndex(
      (s) => s.title.toLowerCase() === label || s.title.toLowerCase().startsWith(`${label} — `),
    );
    if (at < 0) continue;
    const found = sections[at];
    const title = found.title.includes(' — ')
      ? found.title.slice(found.title.indexOf(' — ') + 3).trim()
      : '';
    const body = bodyWithStrays(sections, at, isSeasonHeading);
    entry[season] = { title, body: markdownToHtml(injectMentions(body, mentions)) };
  }

  return {
    year: Number(data.year ?? 0),
    strand: (data.strand === 'gm' ? 'gm' : 'player') as TimelineStrand,
    entry,
  };
}
