import { test, expect } from '@playwright/test';
import {
  mockSupabase,
  seedSessionScript,
  SPACE_ID,
  MAP_ID,
  MAP_UPDATED_AT,
  PIN_LABEL,
} from './fixtures/supabaseMock';

/**
 * The offline map path, end to end in a real browser.
 *
 * Vitest proved the units; it cannot prove this. The failure being chased —
 * "Could not load the map image" while offline, with no error in the console —
 * only exists in the join between the prefetch sweep, IndexedDB, and the
 * blob-first branch of `getMapImageUrl`.
 */

const BLOB_KEY = `${SPACE_ID}:${MAP_ID}:${MAP_UPDATED_AT}`;

/**
 * Reads the blob keys WITHOUT creating the database.
 *
 * `indexedDB.open(name)` with no version creates an empty database when none
 * exists. Doing that from a probe is destructive: the app's
 * `openDB(name, 1, { upgrade })` then finds version 1 already present, skips
 * the upgrade, and never gets its object stores — so every subsequent write
 * fails. The probe has to abort on `upgradeneeded` instead.
 */
async function readBlobKeys(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('inkstone-offline');
        let creating = false;
        req.onupgradeneeded = () => {
          creating = true;
          req.transaction?.abort();
        };
        req.onerror = () => resolve(creating ? [] : [`OPEN_ERROR:${req.error?.name}`]);
        req.onblocked = () => resolve(['BLOCKED']);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('blobs')) {
            db.close();
            return resolve(['NO_BLOBS_STORE']);
          }
          const keys = db.transaction('blobs').objectStore('blobs').getAllKeys();
          keys.onsuccess = () => {
            const out = keys.result.map(String);
            db.close();
            resolve(out);
          };
          keys.onerror = () => {
            db.close();
            resolve(['READ_ERROR']);
          };
        };
      }),
  );
}

test('prefetches map bytes into IndexedDB while online', async ({ page }) => {
  const counters = await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  await page.goto('/#/maps');
  await expect(page.getByRole('heading', { name: /maps/i })).toBeVisible();

  await expect
    .poll(async () => (await readBlobKeys(page)).filter((k) => k.startsWith(SPACE_ID)).length, {
      timeout: 20_000,
      message: 'no map bytes reached IndexedDB',
    })
    .toBe(1);

  expect(await readBlobKeys(page)).toContain(BLOB_KEY);
  expect(counters.viewUrl, 'signed URL never minted').toBeGreaterThan(0);
  expect(counters.imageBytes, 'signed URL never fetched').toBeGreaterThan(0);
});

test('does not re-download bytes it already has', async ({ page }) => {
  const counters = await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  await page.goto('/#/maps');
  await expect
    .poll(async () => (await readBlobKeys(page)).includes(BLOB_KEY), { timeout: 20_000 })
    .toBe(true);
  const afterFirst = counters.imageBytes;

  await page.reload();
  await page.waitForTimeout(2500);

  expect(counters.imageBytes).toBe(afterFirst);
});

test('renders the map from IndexedDB with the network cut', async ({ page, context }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  await page.goto('/#/maps');
  await expect
    .poll(async () => (await readBlobKeys(page)).includes(BLOB_KEY), {
      timeout: 20_000,
      message: 'prefetch never stored the map',
    })
    .toBe(true);

  await context.setOffline(true);
  await page.goto(`/#/map/${MAP_ID}`);

  // The failure mode being reproduced.
  await expect(page.getByText(/could not load the map image/i)).toHaveCount(0);

  const img = page.locator('img').first();
  await expect(img).toBeVisible({ timeout: 15_000 });
  // A blob: URL proves it came from IndexedDB, not from a signed URL or cache.
  await expect(img).toHaveAttribute('src', /^blob:/);

  await context.setOffline(false);
});

test('keeps the map pins offline, not just the image', async ({ page, context }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  // Visit the map once online so both the bytes and the pin snapshot land.
  await page.goto(`/#/map/${MAP_ID}`);
  await expect(page.getByText(PIN_LABEL).first()).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await readBlobKeys(page)).includes(BLOB_KEY), { timeout: 20_000 })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();

  // A map with no pins is most of the reason to open a map gone. Pins were
  // fetched straight from the RPC and never cached, so offline they vanished
  // even though the image was there.
  await expect(page.getByText(PIN_LABEL).first()).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});
