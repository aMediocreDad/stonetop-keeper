import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc }),
}));

import worker from '../index';
import { resetCache } from '../fetch';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
};

const GM_TOKEN = 'gm-token-value';
const PLAYER_TOKEN = 'player-token-value';
const URL_MCP = 'https://example.test/mcp';

/**
 * Fixture keyed off `p_token`, the way Postgres is: the GM token sees the plum
 * layer, the player token gets the same rows with GM material stripped (which
 * is what `get_*` do server-side by role), and anything else is rejected.
 */
/** Write RPCs the fixture accepted this test, in order. */
let writes: Array<{ name: string; params: unknown }> = [];

beforeEach(() => {
  rpc.mockReset();
  resetCache();
  writes = [];
  rpc.mockImplementation((name: string, params: { p_token: string }) => {
    const gm = params.p_token === GM_TOKEN;
    if (params.p_token !== GM_TOKEN && params.p_token !== PLAYER_TOKEN) {
      return Promise.resolve({ data: null, error: { message: 'INVALID_TOKEN', code: '28000' } });
    }
    switch (name) {
      case 'get_characters':
        return Promise.resolve({
          data: [
            {
              id: 'c1',
              name: 'Bhael',
              type: 'PJ',
              role: 'Blessed · initiate of Danu',
              notes: '<p>Carries the spark.</p>',
              gm_notes: gm ? '<p>Doubts the goddess.</p>' : null,
              traits: [],
              tags: [],
              gm_only: false,
            },
            {
              id: 'c2',
              name: 'Rula',
              type: 'PNJ',
              role: 'innkeeper',
              notes: '',
              traits: [],
              tags: [],
              gm_only: false,
            },
            {
              id: 'c3',
              name: 'Things Below',
              type: 'MENACE',
              role: 'Arcane enemy',
              notes: '',
              traits: [],
              tags: [],
              gm_only: false,
              // Colonne vide à dessein : le repli sur threat.instinct doit
              // suffire à faire remonter l'instinct à la lecture.
              instinct: '',
              threat: {
                instinct: 'hollow out the hill',
                portents: [
                  { text: 'The well sours', done: false },
                  { text: 'Cattle vanish', done: true },
                ],
                impendingDoom: { text: 'The hill collapses', done: false },
                stakes: 'Who holds the Old Wall?',
                gmMoves: [],
              },
            },
            {
              id: 'c4',
              name: 'The bronze mirror',
              type: 'DISCOVERY',
              role: 'arcanum',
              notes: '',
              traits: [],
              tags: [],
              gm_only: false,
              discovery: {
                tier: 'minor',
                interesting: 'a maker sigil',
                useful: 'the device is near',
                moves: [{ name: 'Inflame', text: 'When you wield it, choose 1:' }],
              },
            },
          ],
          error: null,
        });
      case 'get_locations':
        return Promise.resolve({
          data: [
            {
              id: 'l1',
              name: 'Stonetop',
              description: 'hill town',
              gm_only: false,
              steading: {
                size: 'village',
                stats: { fortunes: 1, population: 0, prosperity: 0, defenses: 0, surplus: 1 },
                debilities: { diminished: false, lacking: false, malcontent: false },
                resources: ['grain'],
                fortifications: [],
                assets: [],
                treasury: {
                  silver: { purses: 0, handfuls: 0, coins: 0 },
                  gold: { purses: 0, handfuls: 0, coins: 0 },
                },
                improvements: [],
              },
            },
          ],
          error: null,
        });
      case 'get_relations':
        return Promise.resolve({
          data: [
            {
              id: 'r1',
              from_character_id: 'c1',
              to_character_id: 'c2',
              relation_type: 'ami',
              relation_detail: 'keeps his room',
              gm_only: false,
            },
            {
              id: 'r2',
              from_character_id: 'c4',
              to_character_id: 'c2',
              relation_type: 'held-by',
              gm_only: false,
            },
          ],
          error: null,
        });
      case 'create_character':
        writes.push({ name, params });
        return Promise.resolve({
          data: { id: 'c-new', ...(params as unknown as { p_data: object }).p_data },
          error: null,
        });
      case 'update_character':
      case 'update_location':
        writes.push({ name, params });
        return Promise.resolve({
          data: { id: (params as unknown as { p_id: string }).p_id },
          error: null,
        });
      case 'create_relation':
        writes.push({ name, params });
        return Promise.resolve({ data: { id: 'r-new' }, error: null });
      case 'save_timeline_entry':
        writes.push({ name, params });
        return Promise.resolve({ data: { id: 't1' }, error: null });
      case 'save_gm_timeline_entry':
        if (!gm) {
          return Promise.resolve({ data: null, error: { message: 'FORBIDDEN', code: '42501' } });
        }
        writes.push({ name, params });
        return Promise.resolve({ data: { id: 't1' }, error: null });
      case 'save_gm_journal':
        if (!gm) {
          return Promise.resolve({ data: null, error: { message: 'FORBIDDEN', code: '42501' } });
        }
        writes.push({ name, params });
        return Promise.resolve({ data: { id: 'j1' }, error: null });
      case 'get_maps':
        // The gm-only map exists only in the GM's list — server-side filtering.
        return Promise.resolve({
          data: [
            { id: 'm1', name: 'The Vale', description: 'hand-drawn survey', gm_only: false },
            ...(gm ? [{ id: 'm2', name: 'Cult tunnels', gm_only: true }] : []),
          ],
          error: null,
        });
      case 'get_map_pins':
        return Promise.resolve({
          data:
            (params as { p_map_id?: string }).p_map_id === 'm1'
              ? [
                  {
                    id: 'p1',
                    map_id: 'm1',
                    x: 0.1,
                    y: 0.2,
                    character_id: 'c1',
                    gm_only: false,
                  },
                  ...(gm
                    ? [
                        {
                          id: 'p2',
                          map_id: 'm1',
                          x: 0.9,
                          y: 0.9,
                          label: 'Buried shrine',
                          note: 'Only Bhael suspects.',
                          gm_only: true,
                        },
                      ]
                    : []),
                ]
              : [],
          error: null,
        });
      case 'get_timeline':
        return Promise.resolve({
          data: [
            {
              id: 't1',
              entries: { '0': { autumn: { title: 'The Ambush', body: '<p>Dusk.</p>' } } },
              gm_entries: gm ? { '0': { autumn: '<p>The cult moved first.</p>' } } : null,
              current_year: 0,
              current_season: 'autumn',
            },
          ],
          error: null,
        });
      case 'get_gm_journal':
        // Zero rows for a player token — the RPC itself withholds the line
        // (db/13_gm_journal.sql), so the server never has to special-case
        // the role.
        return Promise.resolve({
          data: gm
            ? [
                {
                  id: 'j1',
                  space_id: 's1',
                  notes: '<p>The cult predates the town.</p>',
                  wonders: [
                    {
                      id: 'w1',
                      text: 'What lies beneath the well?',
                      resolved: false,
                      created_at: '2024-01-01T00:00:00Z',
                    },
                  ],
                  updated_at: '2024-01-01T00:00:00Z',
                },
              ]
            : [],
          error: null,
        });
      case 'get_tone_and_content':
        // Same row for both tokens — unlike get_gm_journal, this RPC never
        // withholds by role (db/*_tone_and_content.sql).
        return Promise.resolve({
          data: [
            {
              id: 'tc1',
              space_id: 's1',
              notes: '<p>Grim tone. No on-screen harm to children.</p>',
              updated_at: '2024-01-01T00:00:00Z',
            },
          ],
          error: null,
        });
      default:
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    }
  });
});

/** One JSON-RPC POST against the Worker, as `token`. */
async function call(method: string, params?: unknown, token = GM_TOKEN) {
  const request = new Request(URL_MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? {} }),
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, body: await response.text() };
}

const INIT = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'test', version: '0' },
};

describe('worker auth gate', () => {
  it('404s a request with no Authorization header, without touching Supabase', async () => {
    const response = await worker.fetch(new Request(URL_MCP), env);
    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('404s a non-bearer Authorization header', async () => {
    const response = await worker.fetch(
      new Request(URL_MCP, { headers: { authorization: 'Basic nope' } }),
      env,
    );
    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never returns 401 — that would start an OAuth discovery handshake', async () => {
    const response = await worker.fetch(new Request(URL_MCP), env);
    expect(response.status).not.toBe(401);
  });

  it('accepts any well-formed bearer at the protocol layer', async () => {
    const { status } = await call('initialize', INIT, 'not-a-real-token');
    expect(status).toBeLessThan(400);
  });
});

describe('mcp protocol', () => {
  it('answers initialize with the server name', async () => {
    const { status, body } = await call('initialize', INIT);
    expect(status).toBeLessThan(400);
    expect(body).toContain('ink-and-stone-campaign');
  });

  it('lists the read and write tools, and nothing destructive', async () => {
    await call('initialize', INIT);
    const { body } = await call('tools/list');
    for (const name of [
      'get_campaign_brief',
      'search_campaign',
      'get_entity',
      'get_chronicle',
      'save_chronicle_entry',
      'create_character',
      'update_character',
      'create_relation',
      'update_location',
      'update_steading',
      'tick_portent',
      'add_wonder',
      'resolve_wonder',
      'append_gm_journal',
    ]) {
      expect(body).toContain(name);
    }
    // The tools can add and amend, never remove or roll back.
    expect(body).not.toContain('delete_');
    expect(body).not.toContain('undo_');
  });

  it('serves get_campaign_brief with GM material for a GM token', async () => {
    const { body } = await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    expect(body).toContain('Bhael');
    expect(body).toContain('Stonetop');
    expect(body).toContain('Doubts the goddess.');
    expect(body).toContain('The cult moved first.');
  });

  it('accepts toneAndContent as an explicit section, isolating just that record', async () => {
    const { body } = await call('tools/call', {
      name: 'get_campaign_brief',
      arguments: { sections: ['toneAndContent'] },
    });
    expect(body).not.toContain('"isError":true');
    expect(body).toContain('## Tone & content');
    expect(body).toContain('Grim tone. No on-screen harm to children.');
    expect(body).not.toContain('## Now');
  });

  it('surfaces the open GM journal wonder in the default brief', async () => {
    const { body } = await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    expect(body).toContain('What lies beneath the well?');
  });

  it('serves the full journal notes when the journal section is requested', async () => {
    const { body } = await call('tools/call', {
      name: 'get_campaign_brief',
      arguments: { sections: ['cast', 'web', 'journal'] },
    });
    expect(body).not.toContain('"isError":true');
    expect(body).toContain('The cult predates the town.');
  });

  it('carries maps and their pins in the brief, with worded positions', async () => {
    const { body } = await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    expect(body).toContain('The Vale');
    expect(body).toContain('Cult tunnels');
    expect(body).toContain('Bhael (north-west)');
    expect(body).toContain('Buried shrine (south-east)');
  });

  it('carries the discovery block in the brief: tier, the GM-held pair, move names and the kind-fitted promoted verb', async () => {
    const { body } = await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    expect(body).toContain('## Discoveries');
    expect(body).toContain('The bronze mirror');
    expect(body).toContain('(Arcanum, minor)');
    expect(body).toContain('a maker sigil');
    expect(body).toContain('the device is near');
    expect(body).toContain('Inflame');
    // Body text stays out — a brief is an index, not a dump.
    expect(body).not.toContain('When you wield it');
    // held-by, not leads-to: an arcanum's promoted relation is possession.
    expect(body).toContain('possessed by Rula');
  });

  it('lists where an entity is pinned in get_entity', async () => {
    const { body } = await call('tools/call', {
      name: 'get_entity',
      arguments: { name_or_id: 'Bhael' },
    });
    expect(body).toContain('Pinned on The Vale (north-west)');
  });

  it('serves search_campaign and get_entity by name', async () => {
    const search = await call('tools/call', {
      name: 'search_campaign',
      arguments: { query: 'spark' },
    });
    expect(search.body).toContain('Bhael');

    const entity = await call('tools/call', {
      name: 'get_entity',
      arguments: { name_or_id: 'Bhael' },
    });
    expect(entity.body).toContain('Blessed');
  });

  it('surfaces instinct via the legacy threat.instinct fallback when the column is empty', async () => {
    const { body } = await call('tools/call', {
      name: 'get_entity',
      arguments: { name_or_id: 'Things Below' },
    });
    expect(body).toContain('Instinct: to hollow out the hill');
  });

  it('searches instinct text too', async () => {
    const { body } = await call('tools/call', {
      name: 'search_campaign',
      arguments: { query: 'hollow' },
    });
    expect(body).toContain('Things Below');
  });

  it('only ever calls read RPCs across a whole session', async () => {
    await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    await call('tools/call', { name: 'get_chronicle', arguments: {} });
    const called = rpc.mock.calls.map((c) => c[0] as string);
    expect(called.length).toBeGreaterThan(0);
    expect(called.every((n) => n.startsWith('get_'))).toBe(true);
  });
});

describe('tenancy', () => {
  it('withholds GM material from a player token', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'get_campaign_brief', arguments: {} },
      PLAYER_TOKEN,
    );
    expect(body).toContain('Bhael');
    expect(body).not.toContain('Doubts the goddess.');
    expect(body).not.toContain('The cult moved first.');
  });

  it('withholds the GM journal notes from a player token requesting the journal section', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'get_campaign_brief', arguments: { sections: ['cast', 'web', 'journal'] } },
      PLAYER_TOKEN,
    );
    expect(body).not.toContain('The cult predates the town.');
  });

  it('serves the tone & content agreement to a player token in the default brief — unlike the GM journal', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'get_campaign_brief', arguments: {} },
      PLAYER_TOKEN,
    );
    expect(body).toContain('Grim tone. No on-screen harm to children.');
  });

  /**
   * `wonders` rides in DEFAULT_SECTIONS, so this is the realistic call a
   * player-token session makes (no explicit `sections`). Asserting the
   * empty fallback text proves the section rendered and came up empty —
   * not merely that it was left out of the request (the '['cast','web',
   * 'journal']' call above never asks for 'wonders' at all, so it could
   * never catch a wonder-isolation break: that assertion was tautological
   * and this test replaces it as the real leak-vector check).
   */
  it('withholds the GM journal wonder from a player token seeing the default brief', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'get_campaign_brief', arguments: {} },
      PLAYER_TOKEN,
    );
    expect(body).not.toContain('What lies beneath the well?');
    expect(body).toContain('No wonderings recorded.');
  });

  it('does not serve a player the snapshot cached for a GM', async () => {
    const gm = await call('tools/call', { name: 'get_campaign_brief', arguments: {} }, GM_TOKEN);
    expect(gm.body).toContain('Doubts the goddess.');
    const player = await call(
      'tools/call',
      { name: 'get_campaign_brief', arguments: {} },
      PLAYER_TOKEN,
    );
    expect(player.body).not.toContain('Doubts the goddess.');
  });

  it('passes each request its own token through to the RPCs', async () => {
    await call('tools/call', { name: 'get_campaign_brief', arguments: {} }, PLAYER_TOKEN);
    const tokens = new Set(rpc.mock.calls.map((c) => (c[1] as { p_token: string }).p_token));
    expect([...tokens]).toEqual([PLAYER_TOKEN]);
  });

  it('reports a rejected token as a tool error naming the fix', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'get_campaign_brief', arguments: {} },
      'stale',
    );
    expect(body).toContain('no longer valid');
    expect(body).toContain('Connect to Claude');
    expect(body).toContain('"isError":true');
  });

  it('reports an ordinary RPC failure as a tool error too, not a transport error', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'get_locations'
        ? Promise.resolve({ data: null, error: { message: 'timeout' } })
        : Promise.resolve({ data: [], error: null }),
    );
    const { status, body } = await call('tools/call', {
      name: 'get_campaign_brief',
      arguments: {},
    });
    expect(status).toBeLessThan(400);
    expect(body).toContain('"isError":true');
    expect(body).toContain('get_locations');
    // Not the token message — this failure is not the GM's to fix by re-copying.
    expect(body).not.toContain('no longer valid');
  });
});

describe('write tools', () => {
  it('appends a chronicle recap under the existing season text, preserving the title', async () => {
    const { body } = await call('tools/call', {
      name: 'save_chronicle_entry',
      arguments: { body: 'The party rested.' },
    });
    expect(body).toContain('Saved Year 0, autumn [player]');
    expect(writes).toHaveLength(1);
    const params = writes[0].params as {
      p_year: number;
      p_season: string;
      p_entry: { title: string | null; body: string };
      p_base_rev: number;
    };
    expect(writes[0].name).toBe('save_timeline_entry');
    expect(params.p_year).toBe(0);
    expect(params.p_season).toBe('autumn');
    expect(params.p_entry.title).toBe('The Ambush');
    expect(params.p_entry.body).toBe('<p>Dusk.</p><p>The party rested.</p>');
    expect(params.p_base_rev).toBe(0);
  });

  it('replaces instead of appending when asked', async () => {
    await call('tools/call', {
      name: 'save_chronicle_entry',
      arguments: { body: 'Rewritten.', mode: 'replace', title: 'New title' },
    });
    const params = writes[0].params as { p_entry: { title: string | null; body: string } };
    expect(params.p_entry.body).toBe('<p>Rewritten.</p>');
    expect(params.p_entry.title).toBe('New title');
  });

  it('turns a player token hitting the GM strand into a readable role error', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'save_chronicle_entry', arguments: { body: 'Secret.', strand: 'gm' } },
      PLAYER_TOKEN,
    );
    expect(body).toContain('"isError":true');
    expect(body).toContain('role does not allow');
    expect(writes).toHaveLength(0);
  });

  it('turns a chronicle CAS conflict into instructions carrying the other side', async () => {
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, params: { p_token: string }) =>
      name === 'save_timeline_entry'
        ? Promise.resolve({
            data: null,
            error: {
              message: 'CONFLICT',
              code: 'P0001',
              details: JSON.stringify({ title: 'Theirs', body: '<p>Their text.</p>', rev: 3 }),
            },
          })
        : base(name, params),
    );
    const { body } = await call('tools/call', {
      name: 'save_chronicle_entry',
      arguments: { body: 'Mine.' },
    });
    expect(body).toContain('"isError":true');
    expect(body).toContain('rev 3');
    expect(body).toContain('Their text.');
    expect(body).toContain('save_chronicle_entry');
  });

  it('creates an NPC with a resolved location and no GM keys unless given', async () => {
    const { body } = await call('tools/call', {
      name: 'create_character',
      arguments: { name: 'Mara', role: 'shepherd', location: 'Stonetop', notes: 'Met at the gate.' },
    });
    expect(body).toContain('Created PNJ');
    expect(body).toContain('Mara');
    expect(body).toContain('(id: c-new)');
    const data = (writes[0].params as { p_data: Record<string, unknown> }).p_data;
    expect(data.location).toBe('l1');
    expect(data.notes).toBe('<p>Met at the gate.</p>');
    // Key presence alone makes Postgres reject a player write (db/08).
    expect('gm_only' in data).toBe(false);
    expect('gm_notes' in data).toBe(false);
    // instinct is genuinely optional too — omitting it should not send an
    // explicit empty string.
    expect('instinct' in data).toBe(false);
  });

  it('refuses to create a character whose name already exists', async () => {
    const { body } = await call('tools/call', {
      name: 'create_character',
      arguments: { name: 'rula' },
    });
    expect(body).toContain('"isError":true');
    expect(body).toContain('update_character');
    expect(writes).toHaveLength(0);
  });

  it('appends to character notes without touching other fields', async () => {
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Bhael', notes_append: 'Now doubts aloud.' },
    });
    const params = writes[0].params as { p_id: string; p_data: Record<string, unknown> };
    expect(params.p_id).toBe('c1');
    expect(params.p_data).toEqual({ notes: '<p>Carries the spark.</p><p>Now doubts aloud.</p>' });
  });

  it('patches instinct', async () => {
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Bhael', instinct: 'get the job done' },
    });
    const params = writes[0].params as { p_id: string; p_data: Record<string, unknown> };
    expect(params.p_id).toBe('c1');
    expect(params.p_data).toEqual({ instinct: 'get the job done' });
  });

  it('replaces the whole traits list, round-tripping a two-trait list', async () => {
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Bhael', traits: ['humorless', 'Eeyore voice'] },
    });
    const params = writes[0].params as { p_data: Record<string, unknown> };
    expect(params.p_data).toEqual({
      traits: [
        { label: 'humorless', checked: false },
        { label: 'Eeyore voice', checked: false },
      ],
    });
  });

  it('dedupes traits by exact label, keeping the first occurrence, and drops blanks', async () => {
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Bhael', traits: ['humorless', '  ', 'humorless', 'gruff'] },
    });
    const params = writes[0].params as { p_data: Record<string, unknown> };
    expect(params.p_data).toEqual({
      traits: [
        { label: 'humorless', checked: false },
        { label: 'gruff', checked: false },
      ],
    });
  });

  it('preserves a ticked requirement across resubmission, drops one omitted, starts a new one unticked', async () => {
    // A discovery whose arcanum requirements have already had one ticked at
    // the table — the shared beforeEach fixture's characters carry no ticked
    // traits, so this overrides get_characters for this test only.
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, params: { p_token: string }) =>
      name === 'get_characters'
        ? Promise.resolve({
            data: [
              {
                id: 'd1',
                name: 'The bronze plate',
                type: 'DISCOVERY',
                role: 'arcanum',
                notes: '',
                traits: [
                  { label: 'dig it up', checked: true },
                  { label: 'decipher the runes', checked: false },
                ],
                tags: [],
                gm_only: false,
              },
            ],
            error: null,
          })
        : base(name, params),
    );

    await call('tools/call', {
      name: 'update_character',
      arguments: {
        name_or_id: 'The bronze plate',
        // "dig it up" resubmitted (was ticked); "decipher the runes" omitted
        // (replace semantics: it must be dropped); one brand-new requirement.
        traits: ['dig it up', 'clean the runes with oil'],
      },
    });
    const params = writes[0].params as { p_data: Record<string, unknown> };
    expect(params.p_data.traits).toEqual([
      { label: 'dig it up', checked: true },
      { label: 'clean the runes with oil', checked: false },
    ]);
  });

  it('still starts every trait unticked when creating a brand-new character', async () => {
    await call('tools/call', {
      name: 'create_character',
      arguments: { name: 'Zosia', traits: ['humorless', 'gruff'] },
    });
    const data = (writes[0].params as { p_data: Record<string, unknown> }).p_data;
    expect(data.traits).toEqual([
      { label: 'humorless', checked: false },
      { label: 'gruff', checked: false },
    ]);
  });

  it('clears all traits when given an empty array', async () => {
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Bhael', traits: [] },
    });
    const params = writes[0].params as { p_data: Record<string, unknown> };
    expect(params.p_data).toEqual({ traits: [] });
  });

  it('leaves traits untouched when the field is omitted', async () => {
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Bhael', instinct: 'get the job done' },
    });
    const params = writes[0].params as { p_data: Record<string, unknown> };
    expect('traits' in params.p_data).toBe(false);
  });

  it('wires instinct and a multi-trait list through create_character', async () => {
    await call('tools/call', {
      name: 'create_character',
      arguments: { name: 'Mara', instinct: 'find the truth', traits: ['Eeyore voice', 'loyal'] },
    });
    const data = (writes[0].params as { p_data: Record<string, unknown> }).p_data;
    expect(data.instinct).toBe('find the truth');
    expect(data.traits).toEqual([
      { label: 'Eeyore voice', checked: false },
      { label: 'loyal', checked: false },
    ]);
  });

  it('creates a DISCOVERY — type is derived from CHARACTER_TYPES, not a hardcoded PJ/PNJ/GROUPE/MENACE enum', async () => {
    const { body } = await call('tools/call', {
      name: 'create_character',
      arguments: { name: 'The bronze plate', type: 'DISCOVERY', role: 'artifact' },
    });
    expect(body).not.toContain('"isError":true');
    expect(body).toContain('Created DISCOVERY');
    expect(body).toContain('The bronze plate');
    const data = (writes[0].params as { p_data: Record<string, unknown> }).p_data;
    expect(data.type).toBe('DISCOVERY');
    expect(data.role).toBe('artifact');
  });

  it('refuses a duplicate relation and creates a new one', async () => {
    const dup = await call('tools/call', {
      name: 'create_relation',
      arguments: { from: 'Rula', to: 'Bhael', type: 'ami' },
    });
    expect(dup.body).toContain('"isError":true');
    expect(dup.body).toContain('already exists');
    expect(writes).toHaveLength(0);

    await call('tools/call', {
      name: 'create_relation',
      arguments: { from: 'Bhael', to: 'Rula', type: 'rival', detail: 'over the well' },
    });
    const data = (writes[0].params as { p_data: Record<string, unknown> }).p_data;
    expect(data).toEqual({
      from_character_id: 'c1',
      to_character_id: 'c2',
      relation_type: 'rival',
      relation_detail: 'over the well',
    });
  });

  it('patches steading numbers, clamps tracks, and preserves the rest of the blob', async () => {
    const { body } = await call('tools/call', {
      name: 'update_steading',
      arguments: { location: 'Stonetop', fortunes: 5, surplus: 3, lacking: true },
    });
    expect(body).toContain('fortunes 3');
    expect(body).toContain('surplus 3');
    const steading = (writes[0].params as { p_data: { steading: Record<string, unknown> } }).p_data
      .steading;
    expect((steading.stats as Record<string, number>).fortunes).toBe(3);
    expect((steading.stats as Record<string, number>).surplus).toBe(3);
    expect((steading.debilities as Record<string, boolean>).lacking).toBe(true);
    expect(steading.resources).toEqual(['grain']);
    expect(steading.size).toBe('village');
  });

  it('ticks a portent by text snippet through a whole-sheet patch', async () => {
    const { body } = await call('tools/call', {
      name: 'tick_portent',
      arguments: { threat: 'Things Below', portent: 'well' },
    });
    // Quotes arrive JSON-escaped in the SSE body, so match around them.
    expect(body).toContain('The well sours');
    expect(body).toContain('marked done');
    expect(body).toContain('2 of 2 portents done');
    const threat = (writes[0].params as { p_data: { threat: Record<string, unknown> } }).p_data
      .threat;
    expect(threat.portents).toEqual([
      { text: 'The well sours', done: true },
      { text: 'Cattle vanish', done: true },
    ]);
    expect(threat.instinct).toBe('hollow out the hill');
  });

  it('invalidates the snapshot cache after a write, so the next read refetches', async () => {
    await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    const readsBefore = rpc.mock.calls.filter((c) => c[0] === 'get_characters').length;
    await call('tools/call', {
      name: 'update_character',
      arguments: { name_or_id: 'Rula', role: 'former innkeeper' },
    });
    await call('tools/call', { name: 'get_campaign_brief', arguments: {} });
    const readsAfter = rpc.mock.calls.filter((c) => c[0] === 'get_characters').length;
    expect(readsAfter).toBeGreaterThan(readsBefore + 1); // write's fresh load + post-write read
  });
});

describe('gm journal write tools', () => {
  // The default fixture's gm_journal row (see beforeEach): one open wonder,
  // "What lies beneath the well?", and one paragraph of notes.
  function params(call: { params: unknown }) {
    return (call.params as { p_data: Record<string, unknown> }).p_data;
  }

  /** Override just get_gm_journal so a GM token also sees zero rows — the
   *  "fresh space, never saved" shape that a player token gets by role. */
  function stubEmptyJournal() {
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, args: { p_token: string }) =>
      name === 'get_gm_journal' ? Promise.resolve({ data: [], error: null }) : base(name, args),
    );
  }

  it('add_wonder appends and saves the whole wonders array', async () => {
    const { body } = await call('tools/call', {
      name: 'add_wonder',
      arguments: { text: 'I wonder who broke the seal' },
    });
    expect(body).not.toContain('"isError":true');
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('save_gm_journal');
    const data = params(writes[0]);
    const wonders = data.wonders as Array<Record<string, unknown>>;
    expect(wonders).toHaveLength(2);
    expect(wonders[0]).toMatchObject({ id: 'w1', text: 'What lies beneath the well?' });
    expect(wonders[1]).toMatchObject({ text: 'I wonder who broke the seal', resolved: false });
    expect(data).not.toHaveProperty('notes'); // key-presence merge respected
  });

  it('add_wonder refuses an exact duplicate of an open wondering', async () => {
    const { body } = await call('tools/call', {
      name: 'add_wonder',
      arguments: { text: 'what lies beneath the well?' },
    });
    expect(body).toContain('"isError":true');
    expect(body).toContain('Already wondering that');
    expect(writes).toHaveLength(0);
  });

  it('add_wonder treats a never-saved journal as empty for a GM token (fresh space)', async () => {
    stubEmptyJournal();
    const { body } = await call('tools/call', {
      name: 'add_wonder',
      arguments: { text: 'First wondering' },
    });
    expect(body).not.toContain('"isError":true');
    expect(writes).toHaveLength(1);
    const data = params(writes[0]);
    expect(data.wonders).toEqual([
      expect.objectContaining({ text: 'First wondering', resolved: false }),
    ]);
  });

  it('resolve_wonder matches by snippet and attaches the resolution', async () => {
    const { body } = await call('tools/call', {
      name: 'resolve_wonder',
      arguments: { wonder: 'well', resolution: "It was Marshall's doing." },
    });
    expect(body).not.toContain('"isError":true');
    expect(writes).toHaveLength(1);
    const data = params(writes[0]);
    const wonders = data.wonders as Array<Record<string, unknown>>;
    expect(wonders[0]).toMatchObject({
      id: 'w1',
      resolved: true,
      resolution: "It was Marshall's doing.",
    });
  });

  it('resolve_wonder reports ambiguity when a snippet matches multiple wonderings', async () => {
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, args: { p_token: string }) =>
      name === 'get_gm_journal'
        ? Promise.resolve({
            data: [
              {
                id: 'j1',
                space_id: 's1',
                notes: '',
                updated_at: '',
                wonders: [
                  { id: 'w1', text: 'What lies beneath the well?', resolved: false, created_at: 't' },
                  { id: 'w2', text: 'Who filled the well with stones?', resolved: false, created_at: 't' },
                ],
              },
            ],
            error: null,
          })
        : base(name, args),
    );
    const { body } = await call('tools/call', {
      name: 'resolve_wonder',
      arguments: { wonder: 'well' },
    });
    expect(body).toContain('"isError":true');
    expect(body).toContain('matches several wonderings');
    expect(writes).toHaveLength(0);
  });

  it('resolve_wonder refuses readably when there is no journal to patch (fresh space)', async () => {
    stubEmptyJournal();
    const { body } = await call('tools/call', {
      name: 'resolve_wonder',
      arguments: { wonder: 'anything' },
    });
    expect(body).toContain('"isError":true');
    // Simplified wording: the add_wonder fresh-space caveat does not belong here.
    expect(body).not.toContain('add_wonder');
    expect(writes).toHaveLength(0);
  });

  it('append_gm_journal appends paragraphs, never replaces', async () => {
    const { body } = await call('tools/call', {
      name: 'append_gm_journal',
      arguments: { body: 'The seal cracked at dusk.' },
    });
    expect(body).not.toContain('"isError":true');
    expect(writes).toHaveLength(1);
    const data = params(writes[0]);
    expect(data.notes).toMatch(/^<p>The cult predates the town\.<\/p>/);
    expect(data.notes).toContain('The seal cracked at dusk.');
    expect(data).not.toHaveProperty('wonders'); // key-presence merge respected
  });

  it('append_gm_journal starts fresh when a GM token has never saved a journal', async () => {
    stubEmptyJournal();
    await call('tools/call', {
      name: 'append_gm_journal',
      arguments: { body: 'Session zero.' },
    });
    expect(writes).toHaveLength(1);
    const data = params(writes[0]);
    expect(data.notes).toBe('<p>Session zero.</p>');
  });

  it('journal write tools fail readably when the token has no journal access', async () => {
    const { body } = await call(
      'tools/call',
      { name: 'add_wonder', arguments: { text: 'I wonder' } },
      PLAYER_TOKEN,
    );
    expect(body).toContain('"isError":true');
    expect(body).toContain('role does not allow');
    expect(writes).toHaveLength(0);
  });
});
