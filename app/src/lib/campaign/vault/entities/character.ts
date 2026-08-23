import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  ArcMove,
  ArcTrack,
  Character,
  DiscoveryBlock,
  StatBlock,
  ThreatPortent,
  ThreatSheet,
  Trait,
} from '../../../../types';
import { htmlToMarkdown, markdownToHtml } from '../../markdown';
import { normalizeThreatSheet } from '../../../character/threatSheet';
import { normalizeStatBlock } from '../../../character/statblock';
import { normalizeDiscovery } from '../../../character/discoveryBlock';
import { CHARACTER_FIELDS } from '../fields';
import { emitFrontmatter, parseFrontmatter } from '../frontmatter';
import { hoistMentions, injectMentions } from '../mentions';
import {
  bodyWithStrays,
  childSections,
  findSection,
  joinBlocks,
  knownTitles,
  parseTaskList,
  parseBulletList,
  bulletList,
  section,
  splitSections,
  taskList,
} from '../blocks';
import type { VaultContext } from '../context';
import { linkOrId, resolveRef } from '../context';

/**
 * A character sheet as one Obsidian note.
 *
 * `role` and `instinct` sit in frontmatter and are NOT repeated in the body:
 * Obsidian renders properties above the note, so restating them would be
 * duplication a lenient importer then has to arbitrate.
 *
 * `threat: true` / `follower: true` are presence markers. Without them a threat
 * or follower block whose every field happens to be empty would be
 * indistinguishable from no block at all, and the sheet would lose its kind on
 * re-import.
 */

const STATBLOCK_FENCE = /```statblock\n([\s\S]*?)\n```/;

/** Every string quoted, unconditionally: `armorNote` is free text like
 *  "0 to 2 (thick hides, shield)", and an unquoted colon is the single most
 *  common way a Fantasy Statblocks fence fails to parse. */
function fenceYaml(data: Record<string, unknown>): string {
  return stringifyYaml(data, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  }).trimEnd();
}

function writeStatBlock(name: string, sb: StatBlock): string {
  const data: Record<string, unknown> = {
    // `layout` points at a user-defined Fantasy Statblocks layout. The plugin is
    // a CONSUMER here — we write this fence and parse it back ourselves, so an
    // awkward layout costs the rendering, never the data.
    layout: 'Stonetop',
    name,
    hp: sb.hp,
    armor: sb.armor,
  };
  if (sb.armorNote) data.armorNote = sb.armorNote;
  data.damage = sb.damage;
  if (sb.specialQualities) data.specialQualities = sb.specialQualities;
  if (sb.moves?.length) data.moves = sb.moves;
  return '```statblock\n' + fenceYaml(data) + '\n```';
}

function parseStatBlock(body: string): StatBlock | null {
  const m = STATBLOCK_FENCE.exec(body);
  if (!m) return null;
  let raw: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]) as unknown;
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const sb: StatBlock = {
    hp: Number(raw.hp ?? 0),
    armor: Number(raw.armor ?? 0),
    damage: String(raw.damage ?? ''),
    moves: Array.isArray(raw.moves) ? raw.moves.map(String) : [],
  };
  if (raw.armorNote) sb.armorNote = String(raw.armorNote);
  if (raw.specialQualities) sb.specialQualities = String(raw.specialQualities);
  return sb;
}

function writeThreat(t: ThreatSheet, toMarkdown: (html: string) => string): string {
  const doom = t.impendingDoom;
  // The doom's text has been rich HTML since the 2026-07 rework, so it is a
  // one-item task list with its Markdown indented beneath — the same shape the
  // journal's wonders use. One rule for every {text, done} in the model.
  // It goes through the note's own converter, mentions and all: a doom naming a
  // character is exactly the kind of thing a GM writes.
  const doomMd = toMarkdown(doom?.text ?? '');
  const doomBlock = doom
    ? `- [${doom.done ? 'x' : ' '}] ${doomMd.split('\n').join('\n      ') || '—'}`
    : '';

  return joinBlocks([
    section(3, 'Portents', taskList(t.portents ?? [])),
    section(3, 'Impending doom', doomBlock),
    section(3, 'Stakes', taskList(t.stakes ?? [])),
    section(3, 'GM moves', bulletList(t.gmMoves ?? [])),
  ]);
}

function parseThreat(
  sections: ReturnType<typeof splitSections>,
  threatIndex: number,
  instinct: string,
  /** The note's hoisted mentions. The doom is rich text like any other field —
   *  its `[[Name]]` links must get their ids back, or a mention written into a
   *  doom comes home pointing at nothing. */
  mentions: Record<string, string>,
): ThreatSheet {
  const kids = childSections(sections, threatIndex);
  const by = (title: string) => kids.find((k) => k.title.toLowerCase() === title.toLowerCase());

  const doomItems = parseTaskList(by('Impending doom')?.body ?? '');
  const doomRaw = doomItems[0];
  const impendingDoom: ThreatPortent = doomRaw
    ? {
        text: markdownToHtml(
          injectMentions(
            (by('Impending doom')?.body ?? '')
              .replace(/^\s*-\s+\[[ xX]\]\s?/, '')
              .split('\n')
              .map((l) => l.replace(/^ {6}/, ''))
              .join('\n')
              .trim()
              .replace(/^—$/, ''),
            mentions,
          ),
        ),
        done: doomRaw.done,
      }
    : { text: '', done: false };

  return {
    instinct,
    portents: parseTaskList(by('Portents')?.body ?? ''),
    impendingDoom,
    stakes: parseTaskList(by('Stakes')?.body ?? ''),
    gmMoves: parseBulletList(by('GM moves')?.body ?? ''),
  };
}

/** Each move a `###` heading with its tags in parentheses, then the body
 *  verbatim. The body is PLAIN TEXT whose `- ` lines are already Markdown —
 *  passing it through unescaped is the whole reason it is not TipTap HTML.
 *
 *  An unnamed move (`name: ''`, the Red Scepter's trigger lines) has nothing
 *  to put in a heading — UNLESS it isn't first. Only the move in position 0
 *  can safely have NO heading at all, because `parseMoves` recovers it from
 *  the parent section's own body (everything before its first `###`). Any
 *  LATER unnamed move needs a heading of its own to mark where the move
 *  before it ends — otherwise the two bodies concatenate into one entry and
 *  the second move's text is gone, not just misfiled. An empty `### ` (hashes
 *  and a space, no title) is that heading: `splitSections`'s heading regex
 *  and `parseMoves`'s title fallback both already treat a blank title as an
 *  unnamed move, so this needs no new parsing, only emitting it. */
/**
 * NOTE on the unnamed-move heading: an unnamed move after the first is written
 * as `### ` — hashes, then a LOAD-BEARING TRAILING SPACE, because
 * `splitSections` requires whitespace after the hashes. An editor configured to
 * strip trailing whitespace will therefore orphan such a move on re-import.
 * The realistic path to one (the blank row `MovesEditor` appends) is closed at
 * the read boundary in `normalizeDiscovery`; a hand-authored unnamed move with
 * a body still relies on that space. Give the move a name and it is immune.
 */
function writeMoves(moves: ArcMove[]): string {
  return moves
    .map((m, i) => {
      const named = m.name !== '';
      const needsHeading = named || i > 0;
      const head = needsHeading
        ? `### ${m.name}${named && m.tags ? ` (${m.tags})` : ''}\n`
        : '';
      const mark = m.gained ? '- [x] gained\n' : '';
      return `${head}${mark}${m.text}`.trim();
    })
    .join('\n\n');
}

/** One entry from `writeMoves`, read back. `name`/`tags` come from the `###`
 *  title (`Name (tags)`); a move with no heading at all — position 0 only,
 *  see `writeMoves` — is whatever text sits in the parent section's OWN body,
 *  before its first sub-heading. A LATER unnamed move gets `writeMoves`'s
 *  empty `### ` heading, which lands here as `kid.title === ''` and falls
 *  through to the same empty name. */
function parseMoves(sections: ReturnType<typeof splitSections>, parentIndex: number): ArcMove[] {
  if (parentIndex < 0) return [];
  const moves: ArcMove[] = [];
  const lead = sections[parentIndex].body.trim();
  if (lead) moves.push(parseMoveEntry('', undefined, lead));
  for (const kid of childSections(sections, parentIndex)) {
    const m = /^(.+?)\s+\(([^()]*)\)$/.exec(kid.title);
    moves.push(parseMoveEntry(m ? m[1] : kid.title, m ? m[2] : undefined, kid.body));
  }
  return moves;
}

/** The `- [x] gained` mark, read back and STRIPPED from `text` regardless of
 *  tick state. Matching only `[xX]` here would leave a hand-unticked
 *  `- [ ] gained` — the ordinary way to clear this in Obsidian — baked into
 *  the move's text forever: `gained` would correctly read back `false`, but
 *  the literal checklist line would never leave `text` again. */
function parseMoveEntry(name: string, tags: string | undefined, body: string): ArcMove {
  const gainedMatch = /^-\s*\[([ xX])\]\s*gained\s*/.exec(body);
  const text = gainedMatch ? body.slice(gainedMatch[0].length) : body;
  const out: ArcMove = { name, text: text.trim() };
  if (tags) out.tags = tags;
  if (gainedMatch && gainedMatch[1].toLowerCase() === 'x') out.gained = true;
  return out;
}

/** `Label: marked/max`, read back into an `ArcTrack`. */
function parseTracks(body: string): ArcTrack[] {
  const out: ArcTrack[] = [];
  for (const line of body.split('\n')) {
    // `(.*?)`, not `(.+?)`: `normalizeTrack` permits `label: ''` (an MCP write
    // or a restored revision can produce one), the writer emits it as `: 2/3`,
    // and a reader that demanded a non-empty label silently dropped the track
    // and its marked pips on re-import.
    const m = /^(.*?):\s*(\d+)\/(\d+)\s*$/.exec(line.trim());
    if (m) out.push({ label: m[1].trim(), marked: Number(m[2]), max: Number(m[3]) });
  }
  return out;
}

/** The discovery block, read back from the frontmatter scalars and the
 *  sections `writeMoves`/`writeCharacter` produce. Assembled as a plain
 *  object and passed through `normalizeDiscovery` — the same single read
 *  boundary the writer normalises through on the way out, so a hand-edited
 *  tier typo or an out-of-range `marked` settles the same way coming in. */
function parseDiscovery(
  sections: ReturnType<typeof splitSections>,
  data: Record<string, unknown>,
): DiscoveryBlock | null {
  const raw: Record<string, unknown> = {};
  if (data.tier !== undefined) raw.tier = data.tier;
  if (data.interesting !== undefined) raw.interesting = data.interesting;
  if (data.useful !== undefined) raw.useful = data.useful;
  const movesIdx = sections.findIndex((s) => s.title.toLowerCase() === 'moves');
  if (movesIdx >= 0) raw.moves = parseMoves(sections, movesIdx);
  const tracksSection = findSection(sections, 'Tracks');
  if (tracksSection) raw.tracks = parseTracks(tracksSection.body);
  const mysteriesIdx = sections.findIndex((s) => s.title.toLowerCase() === 'mysteries');
  if (mysteriesIdx >= 0) raw.mysteries = parseMoves(sections, mysteriesIdx);
  const consequencesSection = findSection(sections, 'Consequences');
  if (consequencesSection) {
    raw.consequences = parseTaskList(consequencesSection.body).map((t) => ({
      label: t.text,
      checked: t.done,
    }));
  }
  return Object.keys(raw).length ? normalizeDiscovery(raw) : null;
}

/** Row keys with no rule in CHARACTER_FIELDS — a column added to Postgres and
 *  the row type but not yet given a home. Preserved verbatim and visibly. */
function unmapped(c: Character): Record<string, unknown> {
  const known = new Set(Object.keys(CHARACTER_FIELDS));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (!known.has(k)) out[k] = v;
  return out;
}

export function writeCharacter(raw: Character, ctx: VaultContext): string {
  // Normalise the JSONB blocks at the boundary, exactly as `traverse.ts` does.
  // These carry LEGACY shapes on real rows — `stakes` was an HTML string and
  // `impendingDoom` bare text before the 2026-07 rework, and a statblock could
  // hold `hp`/`maxHp` — and restoring an old revision resurrects them at any
  // time. Writing them unnormalised crashed the whole export on a single old
  // threat sheet. Normalising here is also what the spec asks for: legacy shapes
  // settle on the way out, which is what the app does at the next save anyway.
  const c: Character = {
    ...raw,
    threat: raw.threat ? normalizeThreatSheet(raw.threat) : null,
    statblock: raw.statblock ? normalizeStatBlock(raw.statblock) : null,
    // Same reason as the two above: a legacy or foreign shape on one row must
    // not crash the whole export.
    discovery: raw.discovery ? normalizeDiscovery(raw.discovery) : null,
  };
  // Every rich field converts through one collector, so the note's `mentions`
  // frontmatter covers all of them and each link is resolved against the vault
  // rather than the label the editor froze into the span.
  const mentions: Record<string, string> = {};
  const toMarkdown = (html: string | null | undefined): string => {
    const hoisted = hoistMentions(htmlToMarkdown(html), ctx);
    Object.assign(mentions, hoisted.mentions);
    return hoisted.md;
  };
  const notesMd = toMarkdown(c.notes);
  const gmNotesMd = toMarkdown(c.gm_notes);
  const threatMd = c.threat ? writeThreat(c.threat, toMarkdown) : '';
  const extra = unmapped(c);
  const disc = c.discovery ?? {};

  const front = emitFrontmatter({
    id: c.id,
    name: c.name,
    type: c.type,
    role: c.role,
    instinct: c.instinct,
    location: c.location ? linkOrId(ctx, c.location) : '',
    tags: c.tags,
    kind: c.kind ?? '',
    dead: c.dead || '',
    gm_only: c.gm_only || '',
    threat: c.threat ? true : '',
    threat_type: c.threat?.type ?? '',
    threat_instinct: c.threat?.instinct ?? '',
    follower: c.follower ? true : '',
    follower_cost: c.follower?.cost ?? '',
    follower_loyalty: c.follower ? c.follower.loyalty : '',
    follower_leader: c.follower?.leaderId ? linkOrId(ctx, c.follower.leaderId) : '',
    tier: disc.tier ?? '',
    interesting: disc.interesting ?? '',
    useful: disc.useful ?? '',
    mentions: Object.keys(mentions).length ? mentions : '',
    created: c.created_at,
    updated: c.updated_at,
    ...(Object.keys(extra).length ? { x_unmapped: extra } : {}),
  });

  const body = joinBlocks([
    section(2, 'Notes', notesMd),
    // A discovery's traits ARE its requirements — the heading
    // follows the sheet, and Markdown's `- [ ]` maps onto {label, checked}
    // exactly. The reader accepts either heading, so an older export and a
    // note a GM renamed by hand both come home.
    section(2, c.type === 'DISCOVERY' ? 'Requirements' : 'Traits',
      taskList((c.traits ?? []).map((t) => ({ text: t.label, done: t.checked })))),
    section(2, 'Moves', writeMoves(disc.moves ?? [])),
    section(2, 'Tracks', (disc.tracks ?? [])
      .map((tr) => `${tr.label}: ${tr.marked}/${tr.max}`).join('\n')),
    section(2, 'Mysteries', writeMoves(disc.mysteries ?? [])),
    section(2, 'Consequences',
      taskList((disc.consequences ?? []).map((x) => ({ text: x.label, done: x.checked })))),
    section(2, 'Stat block', c.statblock ? writeStatBlock(c.name, c.statblock) : ''),
    section(2, 'Threat', threatMd),
    section(2, 'GM Notes', gmNotesMd),
  ]);

  return `${front}\n${body}\n`;
}

/** Every heading this note's format owns — anything else under one of them is
 *  prose someone typed, not a field. See `bodyWithStrays`. `Relations` is here
 *  because the writer appends that generated section after `GM Notes`, and
 *  `Leads`/`Bonds` are its generated sub-headings (see `write.ts`'s
 *  `relationsSection`). */
const KNOWN_TITLES = knownTitles([
  'Notes',
  'Traits',
  'Requirements',
  'Moves',
  'Tracks',
  'Mysteries',
  'Consequences',
  'Stat block',
  'Threat',
  'Portents',
  'Impending doom',
  'Stakes',
  'GM moves',
  'GM Notes',
  'Relations',
  'Leads',
  'Bonds',
]);

export function parseCharacter(md: string, ctx: VaultContext): Character {
  const { data, body } = parseFrontmatter(md);
  const sections = splitSections(body);
  const mentions = (data.mentions ?? {}) as Record<string, string>;
  const prose = (title: string): string => {
    const at = sections.findIndex((s) => s.title.toLowerCase() === title.toLowerCase());
    if (at < 0) return '';
    return markdownToHtml(injectMentions(bodyWithStrays(sections, at, KNOWN_TITLES), mentions));
  };

  // Either heading: `Requirements` is what a discovery exports as, `Traits`
  // what everything else does — and what a discovery exported BEFORE this
  // existed. Falling back rather than branching on `data.type` also survives a
  // note whose type was edited by hand in Obsidian.
  const traits: Trait[] = parseTaskList(
    (findSection(sections, 'Requirements') ?? findSection(sections, 'Traits'))?.body ?? '',
  ).map((t) => ({ label: t.text, checked: t.done }));

  const threatIndex = sections.findIndex((s) => s.title.toLowerCase() === 'threat');
  const hasThreat = data.threat === true || threatIndex >= 0;
  const threat = hasThreat
    ? {
        ...parseThreat(sections, threatIndex, String(data.threat_instinct ?? ''), mentions),
        type: (data.threat_type || null) as ThreatSheet['type'],
      }
    : null;

  const statblock = parseStatBlock(findSection(sections, 'Stat block')?.body ?? '');

  const hasFollower =
    data.follower === true ||
    data.follower_cost !== undefined ||
    data.follower_loyalty !== undefined ||
    data.follower_leader !== undefined;

  return {
    // An absent id is the importer's signal to CREATE — a note authored in
    // Obsidian rather than exported from the app.
    id: String(data.id ?? ''),
    space_id: '',
    name: String(data.name ?? ''),
    type: (data.type ?? 'PNJ') as Character['type'],
    role: String(data.role ?? ''),
    instinct: String(data.instinct ?? ''),
    location: data.location ? resolveRef(ctx, String(data.location)) : undefined,
    notes: prose('Notes'),
    gm_notes: findSection(sections, 'GM Notes') ? prose('GM Notes') : null,
    traits,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    gm_only: data.gm_only === true,
    dead: data.dead === true,
    kind: (data.kind || null) as Character['kind'],
    threat,
    statblock,
    follower: hasFollower
      ? {
          cost: String(data.follower_cost ?? ''),
          loyalty: Number(data.follower_loyalty ?? 0),
          leaderId: data.follower_leader ? resolveRef(ctx, String(data.follower_leader)) : null,
        }
      : null,
    discovery: parseDiscovery(sections, data),
    created_at: String(data.created ?? ''),
    updated_at: String(data.updated ?? ''),
    ...((data.x_unmapped as Record<string, unknown>) ?? {}),
  };
}
