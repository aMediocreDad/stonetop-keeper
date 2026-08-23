import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc }),
}));

import { loadCampaign, resetCache, InvalidTokenError } from '../fetch';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
};

/** Reads succeed for any token; character names are derived from the token so
 *  a test can tell two callers' snapshots apart. `journal` defaults to no
 *  rows — the shape a non-GM token gets back from `get_gm_journal`. `tone`
 *  also defaults to no rows — the shape a space that never saved a tone &
 *  content record gets back from `get_tone_and_content`; unlike `journal` this
 *  is never a function of role. */
function stubPerToken(
  maps: Array<{ id: string; name: string }> = [],
  journal: Array<Record<string, unknown>> = [],
  tone: Array<Record<string, unknown>> = [],
) {
  rpc.mockImplementation((name: string, params: { p_token: string; p_map_id?: string }) => {
    switch (name) {
      case 'get_characters':
        return Promise.resolve({
          data: [{ id: 'c1', name: `Bhael-${params.p_token}`, type: 'PJ' }],
          error: null,
        });
      case 'get_locations':
        return Promise.resolve({ data: [{ id: 'l1', name: 'Stonetop' }], error: null });
      case 'get_relations':
        return Promise.resolve({ data: [], error: null });
      case 'get_timeline':
        return Promise.resolve({
          data: [{ id: 't1', entries: {}, current_year: 0, current_season: 'autumn' }],
          error: null,
        });
      case 'get_maps':
        return Promise.resolve({ data: maps, error: null });
      case 'get_map_pins':
        return Promise.resolve({
          data: [{ id: `pin-${params.p_map_id}`, map_id: params.p_map_id, x: 0.5, y: 0.5 }],
          error: null,
        });
      case 'get_gm_journal':
        return Promise.resolve({ data: journal, error: null });
      case 'get_tone_and_content':
        return Promise.resolve({ data: tone, error: null });
      default:
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    }
  });
}

beforeEach(() => {
  rpc.mockReset();
  resetCache();
});

describe('loadCampaign', () => {
  it('passes the caller token to every read RPC and never joins', async () => {
    stubPerToken();
    const raw = await loadCampaign(env, 'tok-a');
    const called = rpc.mock.calls.map((c) => c[0] as string);
    expect(called).not.toContain('join_space');
    expect(called.every((n) => n.startsWith('get_'))).toBe(true);
    for (const call of rpc.mock.calls) {
      expect((call[1] as { p_token: string }).p_token).toBe('tok-a');
    }
    expect(raw.characters).toHaveLength(1);
    expect(raw.timeline?.current_season).toBe('autumn');
  });

  it('caches per token', async () => {
    stubPerToken();
    await loadCampaign(env, 'tok-a');
    const afterFirst = rpc.mock.calls.length;
    await loadCampaign(env, 'tok-a');
    expect(rpc.mock.calls.length).toBe(afterFirst);
  });

  it('does not serve one token the snapshot fetched for another', async () => {
    stubPerToken();
    const a = await loadCampaign(env, 'tok-a');
    const b = await loadCampaign(env, 'tok-b');
    expect(a.characters[0].name).toBe('Bhael-tok-a');
    expect(b.characters[0].name).toBe('Bhael-tok-b');
    expect(rpc.mock.calls.length).toBeGreaterThan(4);
  });

  it('evicts the oldest entry past the cache bound', async () => {
    stubPerToken();
    for (let i = 0; i < 9; i += 1) await loadCampaign(env, `tok-${i}`);
    const before = rpc.mock.calls.length;
    // tok-0 was evicted by tok-8, so it must be re-fetched.
    await loadCampaign(env, 'tok-0');
    expect(rpc.mock.calls.length).toBeGreaterThan(before);
    // tok-8 is still resident.
    const after = rpc.mock.calls.length;
    await loadCampaign(env, 'tok-8');
    expect(rpc.mock.calls.length).toBe(after);
  });

  it('throws InvalidTokenError when the RPC reports INVALID_TOKEN', async () => {
    rpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: 'INVALID_TOKEN', code: '28000' } }),
    );
    await expect(loadCampaign(env, 'stale')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('does not retry a rejected token', async () => {
    rpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: 'INVALID_TOKEN', code: '28000' } }),
    );
    await expect(loadCampaign(env, 'stale')).rejects.toBeInstanceOf(InvalidTokenError);
    // One batch of seven reads, no second attempt (pins are never reached).
    expect(rpc.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it('fans out one get_map_pins call per map and pools the pins', async () => {
    stubPerToken([
      { id: 'm1', name: 'The Vale' },
      { id: 'm2', name: 'The Delve' },
    ]);
    const raw = await loadCampaign(env, 'tok-a');
    const pinCalls = rpc.mock.calls.filter((c) => c[0] === 'get_map_pins');
    expect(pinCalls.map((c) => (c[1] as { p_map_id: string }).p_map_id).sort()).toEqual([
      'm1',
      'm2',
    ]);
    for (const call of pinCalls) {
      expect((call[1] as { p_token: string }).p_token).toBe('tok-a');
    }
    expect(raw.maps).toHaveLength(2);
    expect(raw.mapPins?.map((p) => p.map_id).sort()).toEqual(['m1', 'm2']);
  });

  it('makes no pin calls for a space without maps', async () => {
    stubPerToken();
    await loadCampaign(env, 'tok-a');
    expect(rpc.mock.calls.some((c) => c[0] === 'get_map_pins')).toBe(false);
  });

  it('includes the gm journal row in the snapshot when the RPC returns one', async () => {
    stubPerToken([], [
      { id: 'j1', space_id: 's1', notes: '<p>plans</p>', wonders: [], updated_at: '' },
    ]);
    const data = await loadCampaign(env, 'token-gm');
    expect(data.gmJournal).toEqual(expect.objectContaining({ notes: '<p>plans</p>' }));
  });

  it('yields a null journal when the RPC returns no rows (player token)', async () => {
    stubPerToken();
    const data = await loadCampaign(env, 'token-player');
    expect(data.gmJournal).toBeNull();
  });

  it('includes the tone & content row in the snapshot when the RPC returns one', async () => {
    stubPerToken([], [], [
      { id: 'tc1', space_id: 's1', notes: '<p>No on-screen harm to children.</p>', updated_at: '' },
    ]);
    const data = await loadCampaign(env, 'token-a');
    expect(data.toneAndContent).toEqual(
      expect.objectContaining({ notes: '<p>No on-screen harm to children.</p>' }),
    );
  });

  it('yields a null tone & content when the space never saved one — for every role, unlike the journal', async () => {
    stubPerToken();
    const data = await loadCampaign(env, 'token-player');
    expect(data.toneAndContent).toBeNull();
  });

  it('does not cache a failed load', async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
    await expect(loadCampaign(env, 'tok-a')).rejects.toThrow(/boom/);
    stubPerToken();
    const raw = await loadCampaign(env, 'tok-a');
    expect(raw.characters).toHaveLength(1);
  });

  it('surfaces a non-auth RPC error as a plain Error', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'get_locations'
        ? Promise.resolve({ data: null, error: { message: 'timeout' } })
        : Promise.resolve({ data: [], error: null }),
    );
    const failure = await loadCampaign(env, 'tok-a').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(InvalidTokenError);
    expect((failure as Error).message).toMatch(/get_locations/);
  });
});
