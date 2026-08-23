import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { markdownToHtml, htmlToMarkdown, htmlToText } from '../../app/src/lib/shared';
import { traverse } from '../../app/src/lib/shared';
import type { CampaignGraph, RawCampaignData } from '../../app/src/lib/shared';
import { RELATION_TYPES } from '../../app/src/lib/shared';
import { CHARACTER_TYPES } from '../../app/src/lib/shared';
import { normalizeSeason, storedRev } from '../../app/src/lib/shared';
import { normalizeThreatSheet } from '../../app/src/lib/shared';
import type { GmJournal, Season, Steading, ThreatSheet, Timeline, Wonder } from '../../app/src/lib/shared';
import { WriteRpcError, invalidate, loadCampaign, writeRpc, type Env } from './fetch';
import { resolveEntityId, type ResolvePool } from './query';
import { fail, guard, text, type ToolResult } from './result';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const RELATION_IDS = RELATION_TYPES.map((r) => r.id) as [string, ...string[]];
// Derived, not a literal list: a hardcoded copy is what left this tool unable
// to create a DISCOVERY for the whole of the type's first release. Same shape
// as RELATION_IDS above, and for the same reason.
const CHARACTER_TYPE_IDS = CHARACTER_TYPES as unknown as [string, ...string[]];

/** Track stats clamp to the Stonetop sheet's printed range; surplus is a counter. */
const TRACK_MIN = -1;
const TRACK_MAX = 3;

/**
 * Every write happens against live state, never the planning-session snapshot:
 * drop the cache first, so name resolution and read-modify-write patches see
 * what the table sees right now. `writeRpc` drops it again after the write.
 */
async function freshGraph(env: Env, token: string): Promise<{ raw: RawCampaignData; graph: CampaignGraph }> {
  invalidate(token);
  const raw = await loadCampaign(env, token);
  return { raw, graph: traverse(raw) };
}

/**
 * The write-side `guard`: on top of the invalid-token replacement it turns the
 * Postgres refusals a model can act on — CONFLICT, FORBIDDEN, NOT_FOUND,
 * INVALID_INPUT — into instructions rather than bare strings.
 */
function guardWrite<A>(
  handler: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return guard(async (args: A) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof WriteRpcError) return fail(explainWriteError(error));
      throw error;
    }
  });
}

function explainWriteError(error: WriteRpcError): string {
  if (error.message.includes('CONFLICT')) {
    const current = parseConflictEntry(error.details);
    return (
      'Conflict: someone saved this season while you were writing. It now reads' +
      `${current.title ? ` — "${current.title}"` : ''} (rev ${current.rev}):\n${current.body}\n` +
      'Merge your text with that and call save_chronicle_entry again.'
    );
  }
  if (error.message.includes('FORBIDDEN') || error.code === '42501') {
    return (
      'Your token\'s role does not allow this write. Viewer tokens are read-only; ' +
      'the GM strand, GM-only flags and GM notes need a GM token.'
    );
  }
  if (error.message.includes('NOT_FOUND')) {
    return 'Postgres reports the target row as not visible to your token — it may be GM-only or deleted.';
  }
  return `${error.rpc} failed: ${error.message}${error.details ? ` (${error.details})` : ''}`;
}

/**
 * The season as it now stands on the server, for the model to merge against.
 * Markdown, not flattened text: the retry resubmits this body as Markdown with
 * `mode: 'replace'`, so anything the flattener dropped — bold, lists, headings,
 * links — would be permanently gone from the season the moment two people wrote
 * the same one.
 */
function parseConflictEntry(details: string): { title?: string; body: string; rev: number } {
  try {
    const entry = normalizeSeason(JSON.parse(details));
    return { title: entry.title, body: htmlToMarkdown(entry.body), rev: storedRev(JSON.parse(details)) };
  } catch {
    return { body: details || '(unreadable)', rev: NaN };
  }
}

/**
 * Traits are a replace-the-whole-list field, same as the app's chip editor
 * (CharacterForm/CharacterSheetPage): trim, drop blanks, dedupe by exact
 * label keeping the first occurrence, then shape for the `traits` column.
 *
 * `current` is the row's traits AS THEY STAND before this write, keyed by
 * label, so a requirement ticked at the table survives an update_character
 * call that resubmits the same label — before Task 10 nothing rendered or
 * toggled `checked` at all, so resetting it on every write was harmless;
 * Task 5 made a DISCOVERY's requirements tickable in the app, which turned
 * that reset into silent data loss the first time a GM ticked one and then
 * asked the assistant to touch the character. Only a label PRESENT in
 * `current` carries its tick forward — a label new to this submission still
 * starts unticked, and "traits replaces the full trait list" still holds: a
 * label dropped from `traits` is gone, tick or no tick. `create_character`
 * has no prior row and calls this with no `current`, so it is unaffected.
 */
function buildTraits(
  traits: string[],
  current: { label: string; checked: boolean }[] = [],
): { label: string; checked: boolean }[] {
  const wasChecked = new Map(current.map((t) => [t.label, t.checked]));
  const seen = new Set<string>();
  const result: { label: string; checked: boolean }[] = [];
  for (const raw of traits) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push({ label, checked: wasChecked.get(label) ?? false });
  }
  return result;
}

/** Shared name/id resolution with the failure already formatted for the model. */
function resolveOrFail(
  graph: CampaignGraph,
  nameOrId: string,
  pool: ResolvePool,
): { id: string } | { error: ToolResult } {
  const resolved = resolveEntityId(graph, nameOrId, pool);
  if ('id' in resolved) return resolved;
  if (!resolved.candidates.length) {
    return { error: fail(`Nothing matches "${nameOrId}". search_campaign can help find the right name.`) };
  }
  return {
    error: fail(`"${nameOrId}" is ambiguous. Candidates: ${resolved.candidates.join(', ')}.`),
  };
}

const UNDO_NOTE = 'Every write lands in the ledger; a GM can undo it from the app (Ledger page).';

export function registerWriteTools(server: McpServer, env: Env, token: string): void {
  server.registerTool(
    'save_chronicle_entry',
    {
      description:
        'Write a chronicle (timeline) season entry — the post-session recap. strand "player" is the shared strand (writing it moves the current-season marker, as in the app); "gm" is the GM-only margin strand. Defaults to the current year/season and to appending after any existing text; mode "replace" overwrites the body. Markdown: blank lines separate paragraphs, and **bold**, *italic*, lists, ## headings, > quotes and [links](url) all render.',
      inputSchema: z.object({
        body: z.string().min(1),
        strand: z.enum(['player', 'gm']).optional(),
        year: z.number().int().optional(),
        season: z.enum(SEASONS).optional(),
        title: z.string().optional(),
        mode: z.enum(['append', 'replace']).optional(),
      }),
    },
    guardWrite(async ({ body, strand = 'player', year, season, title, mode = 'append' }) => {
      const { raw } = await freshGraph(env, token);
      const timeline: Timeline | null = raw.timeline;
      const targetYear = year ?? timeline?.current_year ?? null;
      const targetSeason = (season ?? timeline?.current_season ?? null) as Season | null;
      if (targetYear == null || targetSeason == null) {
        return fail(
          'No current-season marker is set, so year and season must be passed explicitly.',
        );
      }
      const entries = strand === 'gm' ? timeline?.gm_entries : timeline?.entries;
      const stored = entries?.[String(targetYear)]?.[targetSeason];
      const current = normalizeSeason(stored);
      const html =
        mode === 'append' && current.body ? current.body + markdownToHtml(body) : markdownToHtml(body);
      const entryTitle = title ?? current.title ?? null;
      await writeRpc(
        env,
        token,
        strand === 'gm' ? 'save_gm_timeline_entry' : 'save_timeline_entry',
        {
          p_year: targetYear,
          p_season: targetSeason,
          p_entry: { title: entryTitle, body: html },
          p_base_rev: storedRev(stored),
        },
      );
      return text(
        `Saved Year ${targetYear}, ${targetSeason} [${strand}]` +
          `${entryTitle ? ` — "${entryTitle}"` : ''} (${mode}). ${UNDO_NOTE}`,
      );
    }),
  );

  server.registerTool(
    'create_character',
    {
      description:
        'Add a character to the wiki: an NPC the party just met, a group, a threat, or a discovery — something there is to find. type defaults to NPC. type: "PJ" (player character), "PNJ" (NPC), "GROUPE" (a group or faction), "MENACE" (a threat), "DISCOVERY" (something to find). The codes are French because the stored column values are; do not translate them. role: read according to `type` — the playbook for a PJ, the occupation for a PNJ, the role in the group for a GROUPE, and for a DISCOVERY the KIND, one of: clue, revelation, site, encounter, opportunity, artifact, arcanum (lowercase, English). A MENACE has none. Leaving role empty still stores the discovery unfiled, but the sheet\'s kind picker no longer offers that state: opening such a row seeds it with the first kind and the next save files it there. Name the kind rather than relying on that. A `revelation` is the thing a clue points at — file the conclusion the party can reach as its own entry, then point clues at it with create_relation\'s `leads-to`. location accepts a name or id. notes/gm_notes are Markdown (blank lines separate paragraphs; **bold**, lists and ## headings render). instinct is the "to …" one-liner (pass without the leading "to"); meaningless for a DISCOVERY. traits are memorable descriptors ("humorless", "Eeyore voice") — tags are mechanical descriptors (cunning, warrior); do not put traits in tags. For a DISCOVERY these are its REQUIREMENTS — an arcanum\'s list of what must happen before its mysteries unlock, ticked as play satisfies them (new traits start unticked). traits replaces the full trait list. Refuses a name that already exists — update the existing sheet instead.',
      inputSchema: z.object({
        name: z.string().min(1),
        type: z.enum(CHARACTER_TYPE_IDS).optional(),
        role: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        instinct: z.string().optional(),
        traits: z.array(z.string()).optional(),
        gm_only: z.boolean().optional(),
        gm_notes: z.string().optional(),
      }),
    },
    guardWrite(async ({ name, type = 'PNJ', role, location, notes, tags, instinct, traits, gm_only, gm_notes }) => {
      const { graph } = await freshGraph(env, token);
      const clash = graph.characters.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
      if (clash) {
        return fail(
          `"${clash.name}" already exists (id: ${clash.id}, ${clash.kind}). Use update_character, or pick a distinct name.`,
        );
      }
      let locationId: string | undefined;
      if (location) {
        const resolved = resolveOrFail(graph, location, 'locations');
        if ('error' in resolved) return resolved.error;
        locationId = resolved.id;
      }
      // GM-only keys ride along only when given: their mere presence makes
      // Postgres reject a player token's write (db/08).
      const created = await writeRpc<{ id: string }>(env, token, 'create_character', {
        p_data: {
          name: name.trim(),
          type,
          role: role ?? '',
          notes: markdownToHtml(notes),
          traits: buildTraits(traits ?? []),
          tags: tags ?? [],
          ...(instinct != null && { instinct }),
          ...(locationId && { location: locationId }),
          ...(gm_only != null && { gm_only }),
          ...(gm_notes != null && { gm_notes: markdownToHtml(gm_notes) }),
        },
      });
      return text(`Created ${type} "${name.trim()}" (id: ${created.id}). ${UNDO_NOTE}`);
    }),
  );

  server.registerTool(
    'update_character',
    {
      description:
        'Amend one character sheet after a session. Accepts a name or id. notes_append/gm_notes_append add paragraphs under the existing text (preferred); notes/gm_notes replace it. tags replaces the whole list. location accepts a name or id. instinct is the "to …" one-liner (pass without the leading "to"); meaningless for a DISCOVERY. role: read according to the character\'s type — the playbook for a PJ, the occupation for a PNJ, the role in the group for a GROUPE, and for a DISCOVERY the KIND, one of: clue, revelation, site, encounter, opportunity, artifact, arcanum (lowercase, English). A MENACE has none. Leaving role empty still stores the discovery unfiled, but the sheet\'s kind picker no longer offers that state: opening such a row seeds it with the first kind and the next save files it there. Name the kind rather than relying on that. A `revelation` is the thing a clue points at — file the conclusion the party can reach as its own entry, then point clues at it with create_relation\'s `leads-to`. traits are memorable descriptors ("humorless", "Eeyore voice") — tags are mechanical descriptors (cunning, warrior); do not put traits in tags. For a DISCOVERY these are its REQUIREMENTS — an arcanum\'s list of what must happen before its mysteries unlock, ticked as play satisfies them. Resubmitting a label keeps its tick; a label you omit is removed; a brand-new label starts unticked. traits replaces the full trait list — fetch the character\'s current traits first if you want to append rather than replace. Pass traits: [] to clear all traits.',
      inputSchema: z.object({
        name_or_id: z.string().min(1),
        role: z.string().optional(),
        location: z.string().optional(),
        tags: z.array(z.string()).optional(),
        instinct: z.string().optional(),
        traits: z.array(z.string()).optional(),
        notes: z.string().optional(),
        notes_append: z.string().optional(),
        gm_notes: z.string().optional(),
        gm_notes_append: z.string().optional(),
      }),
    },
    guardWrite(async ({
      name_or_id,
      role,
      location,
      tags,
      instinct,
      traits,
      notes,
      notes_append,
      gm_notes,
      gm_notes_append,
    }) => {
      const { raw, graph } = await freshGraph(env, token);
      const resolved = resolveOrFail(graph, name_or_id, 'characters');
      if ('error' in resolved) return resolved.error;
      const current = raw.characters.find((c) => c.id === resolved.id)!;

      const patch: Record<string, unknown> = {};
      if (role != null) patch.role = role;
      if (tags) patch.tags = tags;
      if (instinct != null) patch.instinct = instinct;
      if (traits) patch.traits = buildTraits(traits, current.traits);
      if (location) {
        const loc = resolveOrFail(graph, location, 'locations');
        if ('error' in loc) return loc.error;
        patch.location = loc.id;
      }
      if (notes != null) patch.notes = markdownToHtml(notes);
      else if (notes_append) patch.notes = (current.notes ?? '') + markdownToHtml(notes_append);
      if (gm_notes != null) patch.gm_notes = markdownToHtml(gm_notes);
      else if (gm_notes_append) {
        patch.gm_notes = (current.gm_notes ?? '') + markdownToHtml(gm_notes_append);
      }
      if (!Object.keys(patch).length) return fail('Nothing to change — pass at least one field.');

      await writeRpc(env, token, 'update_character', { p_id: resolved.id, p_data: patch });
      return text(
        `Updated ${current.name}: ${Object.keys(patch).join(', ')}. ${UNDO_NOTE}`,
      );
    }),
  );

  server.registerTool(
    'create_relation',
    {
      description:
        'Record a relationship between two characters ("X now owes Y", "A serves B"), or a structural link to or from a discovery ("this clue leads to that threat"). from/to accept names or ids. type: one of ami, famille, mentor, compagnon, rival, ennemi, romance, connaissance, membre (social), leads-to, found-with, concerns, held-by, encounter-with (structural), autre. Structural types for discoveries — the DISCOVERY is always the `from` end: `leads-to` (a clue points at its revelation), `held-by` (an artifact or arcanum is possessed by someone), `encounter-with` (who or what an encounter is with), `found-with`, `concerns`. Getting the direction backwards produces a silently inert row. Refuses an exact duplicate (same pair, same type).',
      inputSchema: z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        type: z.enum(RELATION_IDS),
        detail: z.string().optional(),
        gm_only: z.boolean().optional(),
      }),
    },
    guardWrite(async ({ from, to, type, detail, gm_only }) => {
      const { raw, graph } = await freshGraph(env, token);
      const a = resolveOrFail(graph, from, 'characters');
      if ('error' in a) return a.error;
      const b = resolveOrFail(graph, to, 'characters');
      if ('error' in b) return b.error;
      const dup = raw.relations.find(
        (r) =>
          r.relation_type === type &&
          ((r.from_character_id === a.id && r.to_character_id === b.id) ||
            (r.from_character_id === b.id && r.to_character_id === a.id)),
      );
      if (dup) {
        return fail(
          `That ${type} relation already exists${dup.relation_detail ? ` ("${dup.relation_detail}")` : ''}.`,
        );
      }
      await writeRpc(env, token, 'create_relation', {
        p_data: {
          from_character_id: a.id,
          to_character_id: b.id,
          relation_type: type,
          ...(detail != null && { relation_detail: detail }),
          ...(gm_only != null && { gm_only }),
        },
      });
      return text(`Related ${from} — ${type} — ${to}${detail ? ` (${detail})` : ''}. ${UNDO_NOTE}`);
    }),
  );

  server.registerTool(
    'update_location',
    {
      description:
        'Amend one location sheet. Accepts a name or id. notes_append/gm_notes_append add paragraphs under the existing text (preferred); notes/gm_notes replace it. description is the short banner line; tags replaces the whole list. Steading numbers have their own tool: update_steading.',
      inputSchema: z.object({
        name_or_id: z.string().min(1),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
        notes_append: z.string().optional(),
        gm_notes: z.string().optional(),
        gm_notes_append: z.string().optional(),
      }),
    },
    guardWrite(async ({ name_or_id, description, tags, notes, notes_append, gm_notes, gm_notes_append }) => {
      const { raw, graph } = await freshGraph(env, token);
      const resolved = resolveOrFail(graph, name_or_id, 'locations');
      if ('error' in resolved) return resolved.error;
      const current = raw.locations.find((l) => l.id === resolved.id)!;

      const patch: Record<string, unknown> = {};
      if (description != null) patch.description = description;
      if (tags) patch.tags = tags;
      if (notes != null) patch.notes = markdownToHtml(notes);
      else if (notes_append) patch.notes = (current.notes ?? '') + markdownToHtml(notes_append);
      if (gm_notes != null) patch.gm_notes = markdownToHtml(gm_notes);
      else if (gm_notes_append) {
        patch.gm_notes = (current.gm_notes ?? '') + markdownToHtml(gm_notes_append);
      }
      if (!Object.keys(patch).length) return fail('Nothing to change — pass at least one field.');

      await writeRpc(env, token, 'update_location', { p_id: resolved.id, p_data: patch });
      return text(`Updated ${current.name}: ${Object.keys(patch).join(', ')}. ${UNDO_NOTE}`);
    }),
  );

  server.registerTool(
    'update_steading',
    {
      description:
        'Move steading numbers after a session: fortunes/population/prosperity/defenses (tracks, −1..+3), surplus (counter, ≥0), size, and the three debility flags. Values are absolute, not deltas. Only the fields passed change; the rest of the steading sheet is preserved.',
      inputSchema: z.object({
        location: z.string().min(1),
        size: z.enum(['hamlet', 'village', 'town', 'city']).optional(),
        fortunes: z.number().int().optional(),
        population: z.number().int().optional(),
        prosperity: z.number().int().optional(),
        defenses: z.number().int().optional(),
        surplus: z.number().int().optional(),
        diminished: z.boolean().optional(),
        lacking: z.boolean().optional(),
        malcontent: z.boolean().optional(),
      }),
    },
    guardWrite(async ({ location, size, surplus, diminished, lacking, malcontent, ...tracks }) => {
      const { raw, graph } = await freshGraph(env, token);
      const resolved = resolveOrFail(graph, location, 'locations');
      if ('error' in resolved) return resolved.error;
      const row = raw.locations.find((l) => l.id === resolved.id)!;
      if (!row.steading) {
        return fail(`${row.name} has no steading sheet — update_location handles plain locations.`);
      }

      // Whole-blob column: patch a deep copy, clamped where the sheet clamps.
      const steading: Steading = structuredClone(row.steading);
      const clampTrack = (n: number) => Math.max(TRACK_MIN, Math.min(TRACK_MAX, n));
      for (const key of ['fortunes', 'population', 'prosperity', 'defenses'] as const) {
        const value = tracks[key];
        if (value != null) steading.stats[key] = clampTrack(value);
      }
      if (surplus != null) steading.stats.surplus = Math.max(0, surplus);
      if (size) steading.size = size;
      if (diminished != null) steading.debilities.diminished = diminished;
      if (lacking != null) steading.debilities.lacking = lacking;
      if (malcontent != null) steading.debilities.malcontent = malcontent;

      await writeRpc(env, token, 'update_location', {
        p_id: resolved.id,
        p_data: { steading },
      });
      const s = steading.stats;
      return text(
        `${row.name} steading saved — fortunes ${s.fortunes}, population ${s.population}, ` +
          `prosperity ${s.prosperity}, defenses ${s.defenses}, surplus ${s.surplus}. ${UNDO_NOTE}`,
      );
    }),
  );

  server.registerTool(
    'tick_portent',
    {
      description:
        'Mark a grim portent on a threat\'s countdown as happened (or undo the mark with done=false). Identify the portent by a snippet of its text or a 1-based index; pass impending_doom=true to mark the doom itself.',
      inputSchema: z.object({
        threat: z.string().min(1),
        portent: z.string().optional(),
        index: z.number().int().min(1).optional(),
        done: z.boolean().optional(),
        impending_doom: z.boolean().optional(),
      }),
    },
    guardWrite(async ({ threat, portent, index, done = true, impending_doom }) => {
      const { raw, graph } = await freshGraph(env, token);
      const resolved = resolveOrFail(graph, threat, 'characters');
      if ('error' in resolved) return resolved.error;
      const row = raw.characters.find((c) => c.id === resolved.id)!;
      if (!row.threat) return fail(`${row.name} has no threat sheet.`);

      // Objet frais + forme legacy convertie : un tick ré-écrit la fiche
      // sous sa forme actuelle (enjeux en liste, fatalité en HTML).
      const sheet: ThreatSheet = normalizeThreatSheet(row.threat);
      let ticked: string;
      if (impending_doom) {
        sheet.impendingDoom = { ...sheet.impendingDoom, done };
        ticked = htmlToText(sheet.impendingDoom.text) || 'the impending doom';
      } else {
        const found = findPortent(sheet, portent, index);
        if ('error' in found) return found.error;
        sheet.portents[found.at].done = done;
        ticked = sheet.portents[found.at].text;
      }

      await writeRpc(env, token, 'update_character', {
        p_id: resolved.id,
        p_data: { threat: sheet },
      });
      const doneCount = sheet.portents.filter((p) => p.done).length;
      return text(
        `${row.name}: "${ticked}" marked ${done ? 'done' : 'not done'} ` +
          `(${doneCount} of ${sheet.portents.length} portents done). ${UNDO_NOTE}`,
      );
    }),
  );

  server.registerTool(
    'add_wonder',
    {
      description:
        'Add an "I wonder…" entry to the GM journal — an open question about the campaign to answer through play. GM token only. Refuses an exact duplicate of an open wondering.',
      inputSchema: z.object({
        text: z.string().min(1),
      }),
    },
    guardWrite(async ({ text: wonderText }) => {
      const { raw } = await freshGraph(env, token);
      // A GM token on a space that has never saved a journal also gets zero
      // rows (`get_gm_journal`'s "hidden row == missing row" shape) — but here
      // that is not a refusal, it is an empty journal to start filling. A
      // player token still can't get past the RPC (`save_gm_journal` raises
      // FORBIDDEN, which `guardWrite` explains).
      const row = raw.gmJournal ?? { wonders: [] as Wonder[], notes: '' };
      const trimmed = wonderText.trim();
      const dup = row.wonders.find(
        (w) => !w.resolved && w.text.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (dup) return fail(`Already wondering that: "${dup.text}".`);
      const wonders: Wonder[] = [
        ...row.wonders,
        { id: crypto.randomUUID(), text: trimmed, resolved: false, created_at: new Date().toISOString() },
      ];
      await writeRpc(env, token, 'save_gm_journal', { p_data: { wonders } });
      return text(`Wondering added: "${trimmed}". ${UNDO_NOTE}`);
    }),
  );

  server.registerTool(
    'resolve_wonder',
    {
      description:
        'Mark an "I wonder…" entry in the GM journal as answered (or reopen it with resolved=false). Identify it by a snippet of its text or a 1-based index; optionally attach a short note on how it turned out. GM token only.',
      inputSchema: z.object({
        wonder: z.string().optional(),
        index: z.number().int().min(1).optional(),
        resolution: z.string().optional(),
        resolved: z.boolean().optional(),
      }),
    },
    guardWrite(async ({ wonder, index, resolution, resolved = true }) => {
      const { raw } = await freshGraph(env, token);
      const journal = journalOrFail(raw);
      if ('error' in journal) return journal.error;
      const found = findWonder(journal.row.wonders, wonder, index);
      if ('error' in found) return found.error;
      const wonders = journal.row.wonders.map((w, i) =>
        i === found.at
          ? { ...w, resolved, ...(resolution != null && { resolution: resolution.trim() || undefined }) }
          : w,
      );
      await writeRpc(env, token, 'save_gm_journal', { p_data: { wonders } });
      const target = wonders[found.at];
      return text(
        `"${target.text}" marked ${resolved ? 'answered' : 'open again'}` +
          `${target.resolution ? ` — ${target.resolution}` : ''}. ${UNDO_NOTE}`,
      );
    }),
  );

  server.registerTool(
    'append_gm_journal',
    {
      description:
        "Append paragraphs to the GM journal's free-form notes (the space-level GM scratchpad, not a character's gm_notes). Markdown: blank lines separate paragraphs, and **bold**, *italic*, lists, ## headings, > quotes and [links](url) all render. Append-only — there is no replace. GM token only.",
      inputSchema: z.object({
        body: z.string().min(1),
      }),
    },
    guardWrite(async ({ body }) => {
      const { raw } = await freshGraph(env, token);
      // Same empty-journal-is-fine treatment as add_wonder, above.
      const notes = (raw.gmJournal?.notes ?? '') + markdownToHtml(body);
      await writeRpc(env, token, 'save_gm_journal', { p_data: { notes } });
      return text(`Journal notes appended. ${UNDO_NOTE}`);
    }),
  );
}

function findPortent(
  sheet: ThreatSheet,
  portentText: string | undefined,
  index: number | undefined,
): { at: number } | { error: ToolResult } {
  const list = () =>
    sheet.portents.map((p, i) => `${i + 1}. ${p.text}${p.done ? ' (done)' : ''}`).join('\n');
  if (index != null) {
    if (index < 1 || index > sheet.portents.length) {
      return { error: fail(`No portent ${index}. The countdown:\n${list()}`) };
    }
    return { at: index - 1 };
  }
  if (!portentText) {
    return { error: fail(`Pass portent text or an index. The countdown:\n${list()}`) };
  }
  const needle = portentText.trim().toLowerCase();
  const matches = sheet.portents
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.text.toLowerCase().includes(needle));
  if (matches.length === 1) return { at: matches[0].i };
  if (!matches.length) return { error: fail(`No portent matches "${portentText}":\n${list()}`) };
  return { error: fail(`"${portentText}" matches several portents:\n${list()}`) };
}

/** The journal row, or the readable refusal a non-GM token gets (its
 *  get_gm_journal returned zero rows, so there is nothing to resolve). */
function journalOrFail(
  raw: RawCampaignData,
): { row: GmJournal } | { error: ToolResult } {
  if (!raw.gmJournal) {
    return {
      error: fail(
        'No GM journal is visible to this token. The journal needs a GM token — ' +
          'or, on a fresh space, there is nothing yet to resolve.',
      ),
    };
  }
  return { row: raw.gmJournal };
}

function findWonder(
  wonders: Wonder[],
  snippet: string | undefined,
  index: number | undefined,
): { at: number } | { error: ToolResult } {
  const list = () =>
    wonders
      .map((w, i) => `${i + 1}. ${w.text}${w.resolved ? ' (answered)' : ''}`)
      .join('\n');
  if (index != null) {
    if (index < 1 || index > wonders.length) {
      return { error: fail(`No wondering ${index}. The journal:\n${list()}`) };
    }
    return { at: index - 1 };
  }
  if (!snippet) {
    return { error: fail(`Pass wonder text or an index. The journal:\n${list()}`) };
  }
  const needle = snippet.trim().toLowerCase();
  const matches = wonders
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.text.toLowerCase().includes(needle));
  if (matches.length === 1) return { at: matches[0].i };
  if (!matches.length) return { error: fail(`No wondering matches "${snippet}":\n${list()}`) };
  return { error: fail(`"${snippet}" matches several wonderings:\n${list()}`) };
}
