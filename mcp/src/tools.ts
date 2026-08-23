import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { traverse } from '../../app/src/lib/shared';
import {
  DEFAULT_SECTIONS,
  proseRenderer,
  renderChronicle,
  renderEntity,
  type BriefSection,
} from '../../app/src/lib/shared';
import type { CampaignGraph } from '../../app/src/lib/shared';
import { loadCampaign, type Env } from './fetch';
import { KINDS, formatHits, resolveEntityId, searchGraph, type SearchKind } from './query';
import { guard, text } from './result';
import { registerWriteTools } from './writes';

const SECTIONS = [
  'toneAndContent',
  'now',
  'party',
  'places',
  'maps',
  'recent',
  'threats',
  'groups',
  'discoveries',
  'hooks',
  'cast',
  'web',
  'wonders',
  'journal',
] as const;

export { searchGraph, resolveEntityId, formatHits, type SearchKind, type Hit } from './query';

/**
 * Build a fresh MCP server for one request, bound to that request's token.
 * `createMcpHandler` is stateless and calls this factory per exchange, so it
 * must stay cheap — the campaign snapshot is cached in `fetch.ts`, per token.
 */
export function buildServer(env: Env, token: string): McpServer {
  const server = new McpServer({ name: 'ink-and-stone-campaign', version: '0.3.0' });

  const graphFor = async (): Promise<CampaignGraph> => traverse(await loadCampaign(env, token));

  server.registerTool(
    'get_campaign_brief',
    {
      description:
        'Orientation on the campaign: the table\'s tone & content agreement (what to include, exclude, or handle with care — set by the whole table, not just the GM; respect it), current season, the party, places, maps with their pins, recent history, threats, groups, discoveries (the GM\'s prep bench: clues, sites, encounters, opportunities, artifacts, arcana), the GM layer and the GM\'s open “I wonder…” questions. Call this first when planning a session. Pass sections to include the full cast, the whole relation web, or the GM journal notes.',
      inputSchema: z.object({
        sections: z.array(z.enum(SECTIONS)).optional(),
      }),
    },
    guard(async ({ sections }) =>
      text(
        proseRenderer.render(await graphFor(), {
          sections: sections?.length ? (sections as BriefSection[]) : DEFAULT_SECTIONS,
        }),
      ),
    ),
  );

  server.registerTool(
    'search_campaign',
    {
      description:
        'Free-text search across character names, roles, notes (GM notes included), locations and chronicle entries. Returns kind, name, id and a snippet. Use this to find an entity before calling get_entity; a chronicle hit is drilled into with get_chronicle, not get_entity.',
      inputSchema: z.object({
        query: z.string().min(1),
        types: z.array(z.enum(KINDS)).optional(),
      }),
    },
    guard(async ({ query, types }) =>
      text(formatHits(searchGraph(await graphFor(), query, types as SearchKind[]), query)),
    ),
  );

  server.registerTool(
    'get_entity',
    {
      description:
        'Full detail on one character, group, threat or location: its own fields, its relations in sentences, its steading or threat sheet, where it is pinned on maps, and its GM notes. Accepts a name or an id.',
      inputSchema: z.object({ name_or_id: z.string().min(1) }),
    },
    guard(async ({ name_or_id }) => {
      const graph = await graphFor();
      const resolved = resolveEntityId(graph, name_or_id);
      if ('candidates' in resolved) {
        if (!resolved.candidates.length) return text(`Nothing matches "${name_or_id}".`);
        return text(`"${name_or_id}" is ambiguous. Candidates: ${resolved.candidates.join(', ')}.`);
      }
      return text(renderEntity(graph, resolved.id));
    }),
  );

  server.registerTool(
    'get_chronicle',
    {
      description:
        'Chronicle (timeline) entries in a year range (inclusive), both the shared and GM strands. Defaults to the current year and the one before; pass from/to for anything else.',
      inputSchema: z.object({
        from: z.number().int().optional(),
        to: z.number().int().optional(),
      }),
    },
    guard(async ({ from, to }) => {
      const graph = await graphFor();
      const now = graph.now.year;
      const start = from ?? (now == null ? undefined : now - 1);
      // Default `to` clamps at the current year so entries written ahead of
      // time don't masquerade as history; an explicit range sees everything.
      const end = to ?? (from != null || now == null ? undefined : now);
      return text(renderChronicle(graph, { from: start, to: end }));
    }),
  );

  registerWriteTools(server, env, token);

  return server;
}
