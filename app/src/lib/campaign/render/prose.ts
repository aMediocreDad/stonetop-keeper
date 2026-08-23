import { discoveryKindLabel } from '../../character/discoveryKinds';
import { promotedConfigFor } from '../../character/promotedRelations';
import { improvementProgress } from '../../steading/steading';
import { htmlToMarkdown } from '../markdown';
import type {
  CampaignGraph,
  CampaignRenderer,
  ResolvedCharacter,
  ResolvedLocation,
  ResolvedMap,
  ResolvedRelation,
  ResolvedSeason,
} from '../types';

export type BriefSection =
  | 'toneAndContent'
  | 'now'
  | 'party'
  | 'places'
  | 'maps'
  | 'recent'
  | 'threats'
  | 'groups'
  | 'discoveries'
  | 'hooks'
  | 'cast'
  | 'web'
  | 'wonders'
  | 'journal';

export const DEFAULT_SECTIONS: BriefSection[] = [
  // Ahead of everything else: it's not in-fiction content, it's the table's
  // agreement about how the fiction is played (what's in, what's out, the
  // tone to aim for) — a reader should have it before "Now" sets the scene.
  // Unlike `journal`, never role-gated, so it belongs in the default set
  // rather than behind an explicit ask.
  'toneAndContent',
  'now',
  'party',
  'places',
  'maps',
  'recent',
  'threats',
  'groups',
  // In the default brief: the bench is what the GM preps FROM, so a brief
  // without it answers "who and what threatens" and stays silent on "what
  // there is to find". GM-only rows included, as the brief already includes
  // them elsewhere.
  'discoveries',
  'hooks',
  'wonders',
];

export interface ProseOptions {
  sections?: BriefSection[];
}

/** Years kept by the `recent` section: the current one and the one before. */
const RECENT_YEARS = 1;

function heading(text: string): string {
  return `## ${text}`;
}

function bullet(text: string): string {
  return `- ${text}`;
}

/** Indent a multi-line block so it reads as belonging to its bullet. */
function indent(text: string): string {
  return text.replace(/\n/g, '\n  ');
}

function characterLine(c: ResolvedCharacter): string {
  const bits: string[] = [c.name];
  const descriptor = [c.playbook, c.roleRest].filter(Boolean).join(' · ');
  if (descriptor) bits.push(`(${descriptor})`);
  if (c.locationName) bits.push(`— at ${c.locationName}`);
  if (c.memberOf.length) bits.push(`— of ${c.memberOf.join(', ')}`);
  let line = bullet(bits.join(' '));
  if (c.instinct) line += `\n  Instinct: to ${c.instinct}`;
  if (c.notes) line += `\n  ${indent(c.notes)}`;
  return line;
}

function relationSentence(r: ResolvedRelation): string {
  const detail = r.detail ? ` (${r.detail})` : '';
  return bullet(`${r.from.name} — ${r.typeLabel.toLowerCase()} — ${r.to.name}${detail}`);
}

function seasonBlock(e: ResolvedSeason): string {
  const strand = e.strand === 'gm' ? ' [GM]' : '';
  const title = e.title ? ` — ${e.title}` : '';
  return `${bullet(`Year ${e.year}, ${e.season}${strand}${title}`)}\n  ${indent(e.body)}`;
}

function locationLine(l: ResolvedLocation): string {
  const bits = [l.name];
  if (l.description) bits.push(`— ${l.description}`);
  let line = bullet(bits.join(' '));
  if (l.inhabitants.length) line += `\n  Known here: ${l.inhabitants.join(', ')}`;
  if (l.steading) line += '\n  (Steading sheet available — call get_entity for the full block.)';
  return line;
}

function pinLine(p: { name: string; position: string; note: string; gmOnly: boolean }): string {
  const gm = p.gmOnly ? ' [GM]' : '';
  const note = p.note ? ` — ${p.note}` : '';
  return `${p.name} (${p.position})${gm}${note}`;
}

function mapBlock(m: ResolvedMap): string {
  const bits = [m.name];
  if (m.gmOnly) bits.push('[GM]');
  if (m.description) bits.push(`— ${m.description}`);
  if (m.locationName) bits.push(`(of ${m.locationName})`);
  let line = bullet(bits.join(' '));
  if (m.pins.length) line += `\n  Pins: ${m.pins.map(pinLine).join('; ')}`;
  return line;
}

/** 'Pinned on <map> (<position>)' lines for one character or location id. */
function pinnedOn(graph: CampaignGraph, id: string): string[] {
  const lines: string[] = [];
  for (const m of graph.maps) {
    for (const p of m.pins) {
      if (p.characterId !== id && p.locationId !== id) continue;
      const note = p.note ? ` — ${p.note}` : '';
      lines.push(`Pinned on ${m.name} (${p.position})${note}`);
    }
  }
  return lines;
}

function recentSeasons(graph: CampaignGraph): ResolvedSeason[] {
  const now = graph.now.year;
  if (now == null) return graph.chronicle.slice(-4);
  // Upper bound too: a GM-strand entry written ahead of time is planning
  // material for `hooks`, not "recent history".
  return graph.chronicle.filter((e) => e.year >= now - RECENT_YEARS && e.year <= now);
}

function renderThreat(c: ResolvedCharacter): string {
  const lines = [bullet(`${c.name}${c.roleRest ? ` (${c.roleRest})` : ''}`)];
  const t = c.threat;
  // Unconditional: a MENACE can have instinct set with no threat sheet at all
  // (SQL NULL threat, e.g. created via create_character with instinct but no
  // portents/doom/stakes yet). renderEntity's `kind !== 'threat'` guard relies
  // on this line covering every threat, not just ones with a sheet.
  if (c.instinct) lines.push(`  Instinct: to ${c.instinct}`);
  if (t) {
    const portents = t.portents.filter((p) => p.text);
    if (portents.length) {
      lines.push(
        `  Portents: ${portents.map((p) => `${p.text}${p.done ? ' (done)' : ''}`).join('; ')}`,
      );
    }
    const doom = htmlToMarkdown(t.impendingDoom.text);
    if (doom || t.impendingDoom.done) {
      lines.push(`  Impending doom: ${doom}${t.impendingDoom.done ? ' (come to pass)' : ''}`);
    }
    const stakes = t.stakes.filter((s) => s.text);
    if (stakes.length) {
      lines.push(
        `  Stakes: ${stakes.map((s) => `${s.text}${s.done ? ' (answered)' : ''}`).join('; ')}`,
      );
    }
    if (t.gmMoves.length) lines.push(`  GM moves: ${t.gmMoves.join('; ')}`);
  }
  if (c.notes) lines.push(`  ${indent(c.notes)}`);
  if (c.gmNotes) lines.push(`  GM: ${indent(c.gmNotes)}`);
  return lines.join('\n');
}

/** One discovery: its kind in the reader's words, its place, and its
 *  requirements as a checklist — an arcanum's are the whole point of the
 *  entry, and a brief that omitted them would send the GM back to the app. */
function renderDiscovery(c: ResolvedCharacter): string {
  const disc = c.discovery ?? {};
  const bits = [discoveryKindLabel(c.role)];
  // The tier belongs beside the kind: it is what tells a GM whether this is a
  // card or a playbook insert.
  if (disc.tier) bits.push(disc.tier);
  if (c.locationName) bits.push(c.locationName);
  if (c.gmOnly) bits.push('GM only');
  const lines = [bullet(`**${c.name}** (${bits.join(', ')})`)];
  // `c.notes` is ALREADY Markdown (traverse.ts converts once at graph-build
  // time) — same as `characterLine`/`renderThreat`/`renderEntity` below and
  // above, none of which re-convert it. `htmlToMarkdown` here would escape
  // every `**`, `-` and `[[...]]` the note already earned.
  const notes = c.notes.trim();
  if (notes) lines.push(indent(`  ${notes}`));
  for (const t of c.traits ?? []) {
    lines.push(`  - [${t.checked ? 'x' : ' '}] ${t.label}`);
  }
  // The GM-held pair: the brief is GM-facing (get_campaign_brief already
  // includes gm_only rows), so it carries what the sheet hides from players.
  if (disc.interesting) lines.push(`  - interesting: ${disc.interesting}`);
  if (disc.useful) lines.push(`  - useful: ${disc.useful}`);
  // Move NAMES only. A brief is an index — the bodies are what get_entity is
  // for, and pasting three of them per artifact would bury the bench.
  const moveNames = [...(disc.moves ?? []), ...(disc.mysteries ?? [])]
    .map((m) => m.name).filter((n) => n !== '');
  if (moveNames.length) lines.push(`  - moves: ${moveNames.join(', ')}`);
  for (const tr of disc.tracks ?? []) {
    lines.push(`  - ${tr.label}: ${tr.marked}/${tr.max}`);
  }
  // What the arcanum COSTS — the fifth consumer of the block, and the one the
  // sheet, the card and both ends of the vault already carried. A GM asking
  // "what does the Red Scepter cost me" got nothing back without it.
  //
  // One joined line under a named prefix (the shape `renderThreat` uses for
  // stakes), NOT the `- [x] label` the requirements loop above emits: printed
  // that way a consequence is indistinguishable from a requirement, and the
  // two are opposites — one is what must happen before the mysteries unlock,
  // the other is what the arcanum takes once they have. Labels only, like the
  // move names above: the brief is an index, bodies are `get_entity`'s job.
  const consequences = disc.consequences ?? [];
  if (consequences.length) {
    lines.push(
      `  - consequences: ${consequences
        .map((x) => `${x.label}${x.checked ? ' (exacted)' : ''}`)
        .join('; ')}`,
    );
  }
  // The PROMOTED relation, under the verb its kind uses. Keyed off the config
  // rather than the `leads-to` literal this used to hard-code — otherwise an
  // artifact's possession never reaches the brief at all.
  const config = promotedConfigFor(c.role);
  const promoted = c.relations.filter((r) => r.type === config.type && r.from.id === c.id);
  for (const r of promoted) {
    lines.push(`  - ${PROMOTED_VERB[config.type] ?? 'leads to'} ${r.to.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  return lines.join('\n');
}

/** Lower-case verbs for the brief's bullet lines. Separate from the i18n
 *  headings on purpose: this renderer has no React context, and a brief reads
 *  as prose rather than as UI labels. */
const PROMOTED_VERB: Record<string, string> = {
  'leads-to': 'points to',
  'held-by': 'possessed by',
  'encounter-with': 'encounter with',
};

function renderSteading(l: ResolvedLocation): string {
  const s = l.steading!;
  const lines = [
    `Size: ${s.size}`,
    `Fortunes ${s.stats.fortunes}, population ${s.stats.population}, prosperity ${s.stats.prosperity}, defenses ${s.stats.defenses}, surplus ${s.stats.surplus}`,
  ];
  const debilities = Object.entries(s.debilities)
    .filter(([, on]) => on)
    .map(([k]) => k);
  if (debilities.length) lines.push(`Debilities: ${debilities.join(', ')}`);
  if (s.resources.length) lines.push(`Resources: ${s.resources.join(', ')}`);
  if (s.fortifications.length) lines.push(`Fortifications: ${s.fortifications.join(', ')}`);
  if (s.assets.length) lines.push(`Assets: ${s.assets.join(', ')}`);
  const done = s.improvements.filter((i) => i.completed).map((i) => i.name);
  // The sheet stores the whole improvement MENU; only ticked requirements mean
  // the village is actually working on one. Untouched entries are just options.
  const wip = s.improvements
    .filter((i) => !i.completed)
    .map((i) => ({ name: i.name, ...improvementProgress(i) }))
    .filter((i) => i.done > 0)
    .map((i) => `${i.name} (${i.done}/${i.total})`);
  const untouched = s.improvements.length - done.length - wip.length;
  if (done.length) lines.push(`Improvements built: ${done.join(', ')}`);
  if (wip.length) lines.push(`Improvements in progress: ${wip.join(', ')}`);
  if (untouched > 0) lines.push(`Improvements not yet begun: ${untouched} on the menu.`);
  return lines.join('\n');
}

export const proseRenderer: CampaignRenderer<ProseOptions> = {
  id: 'prose',
  render(graph, opts) {
    const sections = opts?.sections ?? DEFAULT_SECTIONS;
    const want = (s: BriefSection) => sections.includes(s);
    const parts: string[] = [];

    if (want('toneAndContent')) {
      // A single flowing Markdown body — the table's own headings (Concept,
      // Aim, Tone, Subject matter, or whatever they chose) live inside it.
      // No sub-structure imposed here, same as `journal` below: the field is
      // deliberately schema-free (see the vault writer's docstring), and
      // splitting or re-nesting it would invent structure the app never
      // asked the table to commit to.
      parts.push(
        `${heading('Tone & content')}\n${
          graph.toneAndContent?.notes || 'No tone & content agreement recorded.'
        }`,
      );
    }

    if (want('now')) {
      const { year, season } = graph.now;
      parts.push(
        `${heading('Now')}\n${
          year == null || season == null
            ? 'No current season marker set.'
            : `Year ${year}, ${season}.`
        }`,
      );
    }

    if (want('party')) {
      const pcs = graph.characters.filter((c) => c.kind === 'pc');
      parts.push(
        `${heading('The party')}\n${pcs.length ? pcs.map(characterLine).join('\n') : 'No PCs recorded.'}`,
      );
    }

    if (want('places')) {
      parts.push(
        `${heading('Places')}\n${
          graph.locations.length
            ? graph.locations.map(locationLine).join('\n')
            : 'No locations recorded.'
        }`,
      );
    }

    if (want('maps')) {
      parts.push(
        `${heading('Maps')}\n${
          graph.maps.length ? graph.maps.map(mapBlock).join('\n') : 'No maps recorded.'
        }`,
      );
    }

    if (want('threats')) {
      const threats = graph.characters.filter((c) => c.kind === 'threat');
      parts.push(
        `${heading('Threats')}\n${
          threats.length ? threats.map(renderThreat).join('\n\n') : 'No threats recorded.'
        }`,
      );
    }

    if (want('groups')) {
      const groups = graph.characters.filter((c) => c.kind === 'group');
      parts.push(
        `${heading('Groups')}\n${
          groups.length
            ? groups
                .map((g) =>
                  bullet(
                    `${g.name}${g.members.length ? `: ${g.members.join(', ')}` : ' (no members recorded)'}`,
                  ),
                )
                .join('\n')
            : 'No groups recorded.'
        }`,
      );
    }

    if (want('discoveries')) {
      const discoveries = graph.characters.filter((c) => c.kind === 'discovery');
      parts.push(
        `${heading('Discoveries')}\n${
          discoveries.length
            ? discoveries.map(renderDiscovery).join('\n\n')
            : 'No discoveries recorded.'
        }`,
      );
    }

    if (want('recent')) {
      const recent = recentSeasons(graph);
      parts.push(
        `${heading('Recent history')}\n${
          recent.length ? recent.map(seasonBlock).join('\n') : 'No chronicle entries.'
        }`,
      );
    }

    if (want('hooks')) {
      const gmSeasons = graph.chronicle.filter((e) => e.strand === 'gm');
      const gmNotes = [
        ...graph.characters.filter((c) => c.gmNotes).map((c) => bullet(`${c.name}: ${c.gmNotes}`)),
        ...graph.locations.filter((l) => l.gmNotes).map((l) => bullet(`${l.name}: ${l.gmNotes}`)),
      ];
      const body = [...gmSeasons.map(seasonBlock), ...gmNotes];
      parts.push(
        `${heading('GM layer')}\n${body.length ? body.join('\n') : 'No GM-only material recorded.'}`,
      );
    }

    if (want('wonders')) {
      const j = graph.journal;
      const open = j?.wonders.filter((w) => !w.resolved) ?? [];
      const resolved = j?.wonders.filter((w) => w.resolved) ?? [];
      const lines = [
        ...open.map((w) => bullet(w.text)),
        ...resolved.map(
          (w) => bullet(`[answered] ${w.text}${w.resolution ? ` — ${w.resolution}` : ''}`),
        ),
      ];
      parts.push(
        `${heading('I wonder…')}\n${lines.length ? lines.join('\n') : 'No wonderings recorded.'}`,
      );
    }

    if (want('journal')) {
      parts.push(
        `${heading('GM journal')}\n${graph.journal?.notes || 'No journal notes.'}`,
      );
    }

    if (want('cast')) {
      const cast = graph.characters.filter((c) => c.kind === 'npc');
      parts.push(
        `${heading('Cast')}\n${cast.length ? cast.map(characterLine).join('\n') : 'No NPCs recorded.'}`,
      );
    }

    if (want('web')) {
      parts.push(
        `${heading('Relations')}\n${
          graph.relations.length
            ? graph.relations.map(relationSentence).join('\n')
            : 'No relations recorded.'
        }`,
      );
    }

    const omitted = (['cast', 'web', 'journal'] as BriefSection[]).filter((s) => !want(s));
    if (omitted.length) {
      const counts: Record<string, number> = {
        cast: graph.characters.filter((c) => c.kind === 'npc').length,
        web: graph.relations.length,
        journal: graph.journal?.notes ? 1 : 0,
      };
      const named = omitted.map((s) => `${s} (${counts[s]} entries)`).join(' and ');
      parts.push(
        `_Omitted to stay inside the tool-result budget: ${named}. ` +
          `Call get_campaign_brief with sections=[${omitted.join(',')}] for the whole thing, ` +
          'or search_campaign / get_entity to drill into one._',
      );
    }

    return parts.join('\n\n');
  },
};

/** Full detail for one character or location, by id. */
export function renderEntity(graph: CampaignGraph, id: string): string {
  const c = graph.characters.find((x) => x.id === id);
  if (c) {
    const lines = [`# ${c.name}`];
    const descriptor = [c.playbook, c.roleRest].filter(Boolean).join(' · ');
    if (descriptor) lines.push(descriptor);
    lines.push(`Kind: ${c.kind}`);
    // Threats get theirs from renderThreat below — printing it here too would
    // duplicate it.
    if (c.instinct && c.kind !== 'threat') lines.push(`Instinct: to ${c.instinct}`);
    if (c.locationName) lines.push(`Location: ${c.locationName}`);
    if (c.tags.length) lines.push(`Tags: ${c.tags.join(', ')}`);
    if (c.traits.length) {
      lines.push(`Traits: ${c.traits.map((t) => `${t.label}${t.checked ? ' ✓' : ''}`).join(', ')}`);
    }
    if (c.memberOf.length) lines.push(`Member of: ${c.memberOf.join(', ')}`);
    if (c.members.length) lines.push(`Members: ${c.members.join(', ')}`);
    lines.push(...pinnedOn(graph, c.id));
    if (c.notes) lines.push('', c.notes);
    if (c.kind === 'threat') lines.push('', renderThreat(c));
    if (c.gmNotes) lines.push('', `GM notes: ${c.gmNotes}`);
    if (c.relations.length) lines.push('', heading('Relations'), ...c.relations.map(relationSentence));
    return lines.join('\n');
  }

  const l = graph.locations.find((x) => x.id === id);
  if (l) {
    const lines = [`# ${l.name}`];
    if (l.description) lines.push(l.description);
    if (l.tags.length) lines.push(`Tags: ${l.tags.join(', ')}`);
    if (l.inhabitants.length) lines.push(`Known here: ${l.inhabitants.join(', ')}`);
    lines.push(...pinnedOn(graph, l.id));
    if (l.notes) lines.push('', l.notes);
    if (l.gmNotes) lines.push('', `GM notes: ${l.gmNotes}`);
    if (l.steading) lines.push('', heading('Steading'), renderSteading(l));
    return lines.join('\n');
  }

  return `Not found: no character or location with id "${id}".`;
}

/** Chronicle entries in a year range (inclusive), both strands. */
export function renderChronicle(
  graph: CampaignGraph,
  range?: { from?: number; to?: number },
): string {
  const from = range?.from ?? -Infinity;
  const to = range?.to ?? Infinity;
  const kept = graph.chronicle.filter((e) => e.year >= from && e.year <= to);
  if (!kept.length) return 'No entries in that range.';
  return kept.map(seasonBlock).join('\n');
}
