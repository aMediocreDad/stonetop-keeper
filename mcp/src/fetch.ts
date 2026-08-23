import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RawCampaignData } from '../../app/src/lib/shared';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

/**
 * A token Postgres refused. Distinct from any other RPC failure because the
 * tool layer turns it into "re-copy the connect command" rather than a bare
 * error string — it is the one failure a GM can act on. `app_space_from_token`
 * raises `INVALID_TOKEN` with errcode 28000 (db/04).
 */
export class InvalidTokenError extends Error {
  constructor() {
    super('INVALID_TOKEN');
    this.name = 'InvalidTokenError';
  }
}

/**
 * A write RPC that Postgres refused for a reason the model can act on —
 * `CONFLICT` (stale chronicle rev; `details` carries the current entry as
 * JSON), `FORBIDDEN` (role too low), `NOT_FOUND`, `INVALID_INPUT`. The write
 * tool layer turns each into a readable tool error instead of a bare string.
 */
export class WriteRpcError extends Error {
  constructor(
    public readonly rpc: string,
    message: string,
    public readonly code: string,
    public readonly details: string,
  ) {
    super(message);
    this.name = 'WriteRpcError';
  }
}

/**
 * Per-isolate snapshot cache, **keyed by token — never by space**. One space can
 * have several live tokens with different `role` values (db/08), so a
 * space-keyed cache would serve a player the GM-filtered snapshot a GM's
 * request populated. Bounded so a busy isolate cannot grow without limit;
 * eviction costs one extra fetch, never a wrong answer. Map iteration is
 * insertion-ordered, so the first key is the oldest.
 */
const MAX_CACHED_TOKENS = 8;
const snapshots = new Map<string, RawCampaignData>();
let client: SupabaseClient | null = null;

/** Test seam — clears the module-scope cache. */
export function resetCache(): void {
  snapshots.clear();
  client = null;
}

function db(env: Env): SupabaseClient {
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Every RPC name here MUST begin with `get_` — these are the reads. */
const READS = [
  'get_characters',
  'get_locations',
  'get_relations',
  'get_timeline',
  'get_maps',
  'get_gm_journal',
  'get_tone_and_content',
] as const;

function isInvalidToken(error: { message?: string; code?: string }): boolean {
  return error.code === '28000' || (error.message ?? '').includes('INVALID_TOKEN');
}

async function readAll(env: Env, token: string): Promise<RawCampaignData> {
  const results = await Promise.all(
    READS.map((name) =>
      db(env)
        .rpc(name, { p_token: token })
        .then((r) => ({ name, data: r.data as unknown, error: r.error })),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    if (isInvalidToken(failed.error!)) throw new InvalidTokenError();
    throw new Error(`${failed.name} failed: ${failed.error!.message}`);
  }

  const byName = new Map(results.map((r) => [r.name, (r.data ?? []) as unknown[]]));
  const timelineRows = byName.get('get_timeline') as RawCampaignData['timeline'][] | undefined;
  const journalRows = byName.get('get_gm_journal') as RawCampaignData['gmJournal'][] | undefined;
  const toneRows = byName.get('get_tone_and_content') as
    | RawCampaignData['toneAndContent'][]
    | undefined;
  const maps = (byName.get('get_maps') ?? []) as NonNullable<RawCampaignData['maps']>;

  return {
    characters: byName.get('get_characters') as RawCampaignData['characters'],
    locations: byName.get('get_locations') as RawCampaignData['locations'],
    relations: byName.get('get_relations') as RawCampaignData['relations'],
    timeline: timelineRows?.[0] ?? null,
    maps,
    mapPins: await readPins(env, token, maps),
    gmJournal: journalRows?.[0] ?? null,
    toneAndContent: toneRows?.[0] ?? null,
  };
}

/**
 * `get_map_pins` is per map (`p_map_id`), so pins fan out one call per visible
 * map — spaces hold a handful of maps, not hundreds. Runs after the main batch
 * because the map list is its input; token validity was already judged there.
 */
async function readPins(
  env: Env,
  token: string,
  maps: NonNullable<RawCampaignData['maps']>,
): Promise<NonNullable<RawCampaignData['mapPins']>> {
  const results = await Promise.all(
    maps.map((m) =>
      db(env)
        .rpc('get_map_pins', { p_token: token, p_map_id: m.id })
        .then((r) => ({ id: m.id, data: r.data as unknown, error: r.error })),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) throw new Error(`get_map_pins(${failed.id}) failed: ${failed.error!.message}`);
  return results.flatMap((r) => (r.data ?? []) as NonNullable<RawCampaignData['mapPins']>);
}

/**
 * Fetch the whole campaign once per token. There is no search RPC, so every
 * tool filters in-process off this snapshot — which also keeps the read tools
 * consistent within one planning session.
 *
 * There is no retry: the Worker holds no credential of its own, so a rejected
 * token cannot be refreshed from in here. The caller re-copies it from the app.
 */
export async function loadCampaign(env: Env, token: string): Promise<RawCampaignData> {
  const cached = snapshots.get(token);
  if (cached) return cached;

  const data = await readAll(env, token);

  if (snapshots.size >= MAX_CACHED_TOKENS) {
    const oldest = snapshots.keys().next().value;
    if (oldest !== undefined) snapshots.delete(oldest);
  }
  snapshots.set(token, data);
  return data;
}

/**
 * Drop one token's snapshot. Called before a read-modify-write (so the patch
 * is computed off live state, not a planning-session cache) and again after
 * every successful write (read-your-writes for the next tool call). Other
 * tokens keep their snapshots — the same staleness the app itself has between
 * refreshes.
 */
export function invalidate(token: string): void {
  snapshots.delete(token);
}

/**
 * Every write RPC the server may call — the write-side mirror of `READS`'
 * discipline. Anything not on this list is unreachable through the tool
 * surface; deletes are deliberately absent (the tools can add and amend, never
 * remove — removal stays a human act in the app).
 */
const WRITES = [
  'create_character',
  'update_character',
  'create_relation',
  'update_location',
  'save_timeline_entry',
  'save_gm_timeline_entry',
  'save_gm_journal',
] as const;
export type WriteRpcName = (typeof WRITES)[number];

/** One write RPC call. Returns the row PostgREST hands back; throws typed errors. */
export async function writeRpc<T = unknown>(
  env: Env,
  token: string,
  name: WriteRpcName,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db(env).rpc(name, { p_token: token, ...params });
  if (error) {
    if (isInvalidToken(error)) throw new InvalidTokenError();
    const details = (error as { details?: string }).details ?? '';
    throw new WriteRpcError(name, error.message ?? 'unknown error', error.code ?? '', details);
  }
  invalidate(token);
  return data as T;
}
