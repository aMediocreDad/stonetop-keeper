import { test, expect } from '@playwright/test';
import { mockSupabase, seedSessionScript, MAP_ID } from './fixtures/supabaseMock';

/**
 * What the map route costs to open, and how its LCP element is fetched.
 *
 * Lighthouse flagged both on `/#/map/:id`: ~117 KiB (gzip) of unused
 * JavaScript from the editor chunk, and an LCP image fetched at default
 * priority. Both are asserted here rather than left to the next audit —
 * neither regression is visible in review, and neither shows up in the
 * unit suite, which never builds a bundle.
 */

/** Scripts the DOCUMENT loaded. Deliberately not `page.on('response')`: the
 *  service worker precaches every asset in the background, so response
 *  interception sees chunks this page never imported. */
async function documentScripts(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => (e as PerformanceResourceTiming).initiatorType === 'script')
      .map((e) => e.name),
  );
}

test('does not load the editor chunk on a page with no editor', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  await page.goto(`/#/map/${MAP_ID}`);
  await expect(page.locator('img[alt="Surrounds"]')).toBeVisible({ timeout: 15_000 });

  // Regression guard for the mention-module split. The pin form needs the
  // mention VOCABULARY (items, prefixed ids); only a mounted editor needs the
  // Tiptap extension. While one module exported both, a `buildMentionItems`
  // import here dragged the whole editor chunk onto the map.
  const tiptap = (await documentScripts(page)).filter((u) => /\/tiptap-[^/]*\.js$/.test(u));
  expect(tiptap, 'the Tiptap chunk is back on the map route').toEqual([]);
});

test('fetches the map image at high priority', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  await page.goto(`/#/map/${MAP_ID}`);

  // The one half of "LCP request discovery" this architecture can satisfy:
  // the URL itself cannot be in the initial document (hash routing, private
  // bucket, bytes resolved through JS), so the image is only ever discovered
  // late — it must at least not queue behind everything else once it is.
  await expect(page.locator('img[alt="Surrounds"]')).toHaveAttribute('fetchpriority', 'high');
});
