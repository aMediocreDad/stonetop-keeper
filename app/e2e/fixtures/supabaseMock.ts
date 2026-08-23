import type { Page } from '@playwright/test';

/**
 * Intercepts every Supabase call the app makes, so the offline map path can be
 * exercised end-to-end in a real browser without a real project.
 *
 * Routing is host-agnostic (`**‍/rest/v1/rpc/**`), so this works against the
 * dummy credentials the e2e bundle is built with.
 */

export const SPACE_ID = '11111111-1111-1111-1111-111111111111';
export const MAP_ID = '22222222-2222-2222-2222-222222222222';
export const MAP_UPDATED_AT = '2026-08-02T10:00:00.000Z';
export const PIN_LABEL = 'The Old Bridge';

/** A tiny but real PNG, so the browser decodes it like any other image. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVQoU2NkYGD4z0AEYBxVSF' +
    'BFjIyMDKMKCasIAJDrBAX3l2mFAAAAAElFTkSuQmCC',
  'base64',
);

export const maps = [
  {
    id: MAP_ID,
    space_id: SPACE_ID,
    name: 'Surrounds',
    description: null,
    location_id: null,
    image_path: `${SPACE_ID}/${MAP_ID}.webp`,
    // Deliberately far larger than any viewport. The `<img>` lays out at these
    // attributes (they come from the row, not the bytes), so the fit-to-view
    // scale is well below 1 — which is what makes an unfitted first frame
    // visible. A small map hides the bug entirely.
    image_width: 4000,
    image_height: 3000,
    thumb: null,
    gm_only: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: MAP_UPDATED_AT,
  },
];

export const pins = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    space_id: SPACE_ID,
    map_id: MAP_ID,
    x: 0.5,
    y: 0.5,
    label: PIN_LABEL,
    note: null,
    character_id: null,
    location_id: null,
    gm_only: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: MAP_UPDATED_AT,
  },
];

export interface MockCounters {
  viewUrl: number;
  imageBytes: number;
}

export async function mockSupabase(page: Page): Promise<MockCounters> {
  const counters: MockCounters = { viewUrl: 0, imageBytes: 0 };

  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    switch (name) {
      case 'get_maps':
        return route.fulfill(json(maps));
      case 'get_map_pins':
        return route.fulfill(json(pins));
      case 'get_characters':
      case 'get_relations':
      case 'get_locations':
      case 'get_revisions':
        return route.fulfill(json([]));
      case 'get_timeline':
      case 'get_gm_journal':
        return route.fulfill(json(null));
      default:
        return route.fulfill(json(null));
    }
  });

  // The Edge Function that mints a short-lived signed URL.
  await page.route('**/functions/v1/map-image/view-url', async (route) => {
    counters.viewUrl += 1;
    return route.fulfill(
      json({ url: 'https://storage.example.test/signed/map.png?token=abc', expiresIn: 3600 }),
    );
  });

  // The signed URL itself — this is the fetch whose bytes must reach IndexedDB.
  await page.route('https://storage.example.test/**', async (route) => {
    counters.imageBytes += 1;
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: PNG_BYTES,
    });
  });

  // Realtime: let the socket fail fast rather than hang the page.
  await page.route('**/realtime/v1/**', (route) => route.abort());

  return counters;
}

/** Dashboard's "What's new" dispensation key (`DashboardPage.tsx`). Its overlay
 *  swallows every click on a first visit, so a seeded session marks it seen —
 *  one place, because a stale copy of this literal reads as a hanging test. */
const WHATS_NEW_KEY = 'inkstone:whatsnew:maps-claude-v2';

/**
 * Writes the persisted Zustand session directly, which is what joining a space
 * produces. Avoids driving the join modal — this suite is about the offline
 * map path, not about auth.
 */
export function seedSessionScript(): string {
  const session = {
    space: {
      id: SPACE_ID,
      name: 'Example Campaign',
      invite_code: 'aa-aaa',
      created_at: '2026-08-01T00:00:00.000Z',
    },
    token: 'e2e-token',
    isAdmin: true,
    role: 'gm',
  };
  return (
    `localStorage.setItem('inkstone-storage', ${JSON.stringify(
      JSON.stringify({ state: { session, sessions: { [SPACE_ID]: session } }, version: 2 }),
    )});` + `localStorage.setItem(${JSON.stringify(WHATS_NEW_KEY)}, '1')`
  );
}
