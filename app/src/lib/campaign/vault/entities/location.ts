import type {
  ImprovementRequirement,
  Location,
  Steading,
  SteadingImprovement,
  SteadingSize,
  TreasuryPile,
} from '../../../../types';
import { htmlToMarkdown, markdownToHtml } from '../../markdown';
import { LOCATION_FIELDS } from '../fields';
import { emitFrontmatter, parseFrontmatter } from '../frontmatter';
import { hoistMentions, injectMentions } from '../mentions';
import {
  bodyWithStrays,
  bulletList,
  childSections,
  findSection,
  idComment,
  joinBlocks,
  knownTitles,
  parseBulletList,
  parseIdComment,
  parseTaskList,
  section,
  splitSections,
  taskList,
  withoutIdComment,
} from '../blocks';
import type { VaultContext } from '../context';

/**
 * A location note, with the settlement sheet when it is a steading.
 *
 * `steading_size` is the only steading value in frontmatter — it classifies the
 * place, so it is what a Bases view filters on. The numbers read as a sheet and
 * belong in the body: tables for stats and treasury, task lists for debilities
 * and each improvement's requirements. A settlement rendered as fifteen
 * frontmatter properties would be a database record; this is a journal.
 */

const STAT_KEYS = ['fortunes', 'population', 'prosperity', 'defenses', 'surplus'] as const;
const PILE_KEYS = ['purses', 'handfuls', 'coins'] as const;

function statsTable(s: Steading): string {
  const head = `| ${STAT_KEYS.map((k) => k[0].toUpperCase() + k.slice(1)).join(' | ')} |`;
  const rule = `|${STAT_KEYS.map(() => '---').join('|')}|`;
  const row = `| ${STAT_KEYS.map((k) => s.stats[k]).join(' | ')} |`;
  return [head, rule, row].join('\n');
}

function parseStatsTable(body: string): Steading['stats'] {
  const rows = tableRows(body);
  const values = rows[0] ?? [];
  const out = {} as Steading['stats'];
  STAT_KEYS.forEach((k, i) => {
    out[k] = Number(values[i] ?? 0);
  });
  return out;
}

function treasuryTable(s: Steading): string {
  const head = '| Metal | Purses | Handfuls | Coins |';
  const rule = '|---|---|---|---|';
  const line = (name: string, p: TreasuryPile) =>
    `| ${name} | ${p.purses} | ${p.handfuls} | ${p.coins} |`;
  return [head, rule, line('Silver', s.treasury.silver), line('Gold', s.treasury.gold)].join('\n');
}

function parseTreasuryTable(body: string): Steading['treasury'] {
  const rows = tableRows(body);
  const pile = (cells: string[] | undefined): TreasuryPile => {
    const out = {} as TreasuryPile;
    PILE_KEYS.forEach((k, i) => {
      out[k] = Number(cells?.[i + 1] ?? 0);
    });
    return out;
  };
  const byName = (name: string) =>
    pile(rows.find((r) => r[0]?.toLowerCase() === name));
  return { silver: byName('silver'), gold: byName('gold') };
}

/** Data rows of a Markdown table, header and rule dropped. */
function tableRows(body: string): string[][] {
  return String(body ?? '')
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter((cells) => !cells.every((c) => /^-{2,}$/.test(c) || c === ''))
    .slice(1);
}

/** "Pull Together ×5" ticked three times renders as `(3/5)`; a simple
 *  requirement carries no counter at all. */
function requirementLine(r: ImprovementRequirement): string {
  const total = /×\s*(\d+)/.exec(r.text)?.[1];
  const suffix = total && r.progress ? ` (${r.progress}/${total})` : '';
  return `${r.text}${suffix}`;
}

function parseRequirement(text: string): ImprovementRequirement {
  const m = /^(.*?)\s*\((\d+)\/(\d+)\)$/.exec(text);
  if (!m) return { text: text.trim(), done: false };
  return { text: m[1].trim(), done: false, progress: Number(m[2]) };
}

function writeImprovement(imp: SteadingImprovement): string {
  const reqs = (imp.requirements ?? []).map((r) => ({ text: requirementLine(r), done: r.done }));
  // Blank-line separated: a task list butted straight against a paragraph is not
  // a list in strict Markdown, and the summary would swallow the requirements.
  return [
    `#### ${imp.name}`,
    idComment({ id: imp.id, custom: imp.custom }),
    imp.summary,
    reqs.length ? taskList(reqs) : '',
    imp.effects ? `Effects: ${imp.effects}` : '',
    `- [${imp.completed ? 'x' : ' '}] Completed`,
  ]
    .filter((p) => p.trim())
    .join('\n\n');
}

function parseImprovement(title: string, body: string): SteadingImprovement {
  const meta = parseIdComment(body);
  const ticks = parseTaskList(body);
  // The trailing "Completed" tick is the improvement's own state; everything
  // before it is a requirement.
  const completedIdx = ticks.findIndex((t) => t.text.toLowerCase() === 'completed');
  const completed = completedIdx >= 0 ? ticks[completedIdx].done : false;
  const reqTicks = completedIdx >= 0 ? ticks.slice(0, completedIdx) : ticks;

  const lines = withoutIdComment(body)
    .split('\n')
    .filter((l) => !/^\s*-\s+\[[ xX]\]/.test(l));
  const effectsLine = lines.find((l) => l.startsWith('Effects: '));
  const summary = lines.filter((l) => l.trim() && !l.startsWith('Effects: ')).join('\n').trim();

  return {
    id: meta.id ?? '',
    name: title,
    summary,
    requirements: reqTicks.map((t) => ({ ...parseRequirement(t.text), done: t.done })),
    effects: effectsLine ? effectsLine.slice('Effects: '.length).trim() : '',
    completed,
    custom: meta.custom === 'true',
  };
}

function writeSteading(s: Steading): string {
  return joinBlocks([
    section(3, 'Stats', statsTable(s)),
    section(
      3,
      'Debilities',
      taskList([
        { text: 'Diminished', done: s.debilities.diminished },
        { text: 'Lacking', done: s.debilities.lacking },
        { text: 'Malcontent', done: s.debilities.malcontent },
      ]),
    ),
    section(3, 'Resources', bulletList(s.resources ?? [])),
    section(3, 'Fortifications', bulletList(s.fortifications ?? [])),
    section(3, 'Assets', bulletList(s.assets ?? [])),
    section(3, 'Treasury', treasuryTable(s)),
    (s.improvements ?? []).length
      ? `### Improvements\n\n${(s.improvements ?? []).map(writeImprovement).join('\n\n')}\n`
      : '',
  ]);
}

function parseSteading(
  sections: ReturnType<typeof splitSections>,
  steadingIndex: number,
  size: SteadingSize,
): Steading {
  const kids = childSections(sections, steadingIndex);
  const by = (t: string) => kids.find((k) => k.title.toLowerCase() === t.toLowerCase());
  const deb = parseTaskList(by('Debilities')?.body ?? '');
  const tick = (name: string) =>
    deb.find((d) => d.text.toLowerCase() === name)?.done ?? false;

  const impIndex = sections.findIndex(
    (s, i) => i > steadingIndex && s.level === 3 && s.title.toLowerCase() === 'improvements',
  );
  const improvements =
    impIndex >= 0
      ? childSections(sections, impIndex).map((c) => parseImprovement(c.title, c.body))
      : [];

  return {
    size,
    stats: parseStatsTable(by('Stats')?.body ?? ''),
    debilities: {
      diminished: tick('diminished'),
      lacking: tick('lacking'),
      malcontent: tick('malcontent'),
    },
    resources: parseBulletList(by('Resources')?.body ?? ''),
    fortifications: parseBulletList(by('Fortifications')?.body ?? ''),
    assets: parseBulletList(by('Assets')?.body ?? ''),
    treasury: parseTreasuryTable(by('Treasury')?.body ?? ''),
    improvements,
  };
}

function unmapped(l: Location): Record<string, unknown> {
  const known = new Set(Object.keys(LOCATION_FIELDS));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(l)) if (!known.has(k)) out[k] = v;
  return out;
}

export function writeLocation(l: Location, ctx: VaultContext): string {
  // One collector for every rich field, so each mention link is resolved against
  // the vault's note names rather than the label frozen into the span.
  const mentions: Record<string, string> = {};
  const toMarkdown = (html: string | null | undefined): string => {
    const hoisted = hoistMentions(htmlToMarkdown(html), ctx);
    Object.assign(mentions, hoisted.mentions);
    return hoisted.md;
  };
  const notesMd = toMarkdown(l.notes);
  const gmNotesMd = toMarkdown(l.gm_notes);
  const extra = unmapped(l);

  const front = emitFrontmatter({
    id: l.id,
    name: l.name,
    color: l.color,
    description: l.description ?? '',
    tags: l.tags ?? [],
    gm_only: l.gm_only || '',
    steading_size: l.steading?.size ?? '',
    mentions: Object.keys(mentions).length ? mentions : '',
    created: l.created_at,
    ...(Object.keys(extra).length ? { x_unmapped: extra } : {}),
  });

  const body = joinBlocks([
    section(2, 'Notes', notesMd),
    l.steading ? `## Steading\n\n${writeSteading(l.steading)}\n` : '',
    section(2, 'GM Notes', gmNotesMd),
  ]);

  return `${front}\n${body}\n`;
}

/** Every heading this note's format owns. An improvement's own `####` heading is
 *  not here, and does not need to be: it only ever sits under `### Improvements`,
 *  which is itself known, so no prose section can run into it. */
const KNOWN_TITLES = knownTitles([
  'Notes',
  'Steading',
  'Stats',
  'Debilities',
  'Resources',
  'Fortifications',
  'Assets',
  'Treasury',
  'Improvements',
  'GM Notes',
]);

export function parseLocation(md: string): Location {
  const { data, body } = parseFrontmatter(md);
  const sections = splitSections(body);
  const mentions = (data.mentions ?? {}) as Record<string, string>;
  const prose = (title: string): string => {
    const at = sections.findIndex((s) => s.title.toLowerCase() === title.toLowerCase());
    if (at < 0) return '';
    return markdownToHtml(injectMentions(bodyWithStrays(sections, at, KNOWN_TITLES), mentions));
  };

  const steadingIndex = sections.findIndex(
    (s) => s.level === 2 && s.title.toLowerCase() === 'steading',
  );
  const size = (data.steading_size || '') as SteadingSize;

  return {
    id: String(data.id ?? ''),
    space_id: '',
    name: String(data.name ?? ''),
    color: String(data.color ?? ''),
    description: data.description ? String(data.description) : undefined,
    notes: prose('Notes'),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    steading: steadingIndex >= 0 ? parseSteading(sections, steadingIndex, size) : null,
    gm_only: data.gm_only === true,
    gm_notes: findSection(sections, 'GM Notes') ? prose('GM Notes') : null,
    created_at: String(data.created ?? ''),
    ...((data.x_unmapped as Record<string, unknown>) ?? {}),
  };
}
