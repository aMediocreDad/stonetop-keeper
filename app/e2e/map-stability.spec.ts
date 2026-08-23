import { test, expect } from '@playwright/test';
import { mockSupabase, seedSessionScript, MAP_ID } from './fixtures/supabaseMock';

/**
 * The map viewer must settle in one step.
 *
 * Reported symptom: the image paints at full natural size, snaps to fit, then
 * the pins paint at the wrong size and snap too — several visible jumps before
 * anything is usable. The cause is ordering: the transform starts at scale 1
 * and the fit is only computed once the image's `load` event fires, so the
 * first painted frame is always wrong.
 *
 * Measured rather than eyeballed: the browser's own layout-shift entries, plus
 * a sample of the image's rendered width over the first second.
 */

/** Installs a layout-shift recorder before any app code runs. */
const RECORDER = `
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      // Shifts following recent input are user-caused and excluded, as in CLS.
      if (!e.hadRecentInput) window.__shifts.push(e.value);
    }
  }).observe({ type: 'layout-shift', buffered: true });
`;

/**
 * Samples the image's rendered width once per frame, but ONLY for frames the
 * user can actually see. A frame laid out at the wrong scale while the content
 * is still transparent is not a visual defect — the defect is seeing the map
 * change size, so that is what gets measured.
 */
async function sampleVisibleImageWidths(page: import('@playwright/test').Page, ms: number) {
  return page.evaluate(async (duration) => {
    const widths: number[] = [];
    const started = Date.now();
    while (Date.now() - started < duration) {
      const img = document.querySelector('img[alt="Surrounds"]') as HTMLImageElement | null;
      const content = img?.closest('.react-transform-component') as HTMLElement | null;
      const visible = content ? Number(getComputedStyle(content).opacity) > 0.01 : false;
      if (img && visible) widths.push(Math.round(img.getBoundingClientRect().width));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return widths;
  }, ms);
}

test('settles at its fitted size without an intermediate full-size frame', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());
  await page.addInitScript(RECORDER);

  await page.goto(`/#/map/${MAP_ID}`);
  const widths = await sampleVisibleImageWidths(page, 1200);
  const rendered = widths.filter((w) => w > 0);

  expect(rendered.length, 'image never became visible').toBeGreaterThan(0);

  // Every VISIBLE frame should be the settled size. More than one distinct
  // width means the user watched it resize.
  const distinct = [...new Set(rendered)];
  expect(distinct, `image was painted at ${distinct.length} different sizes`).toHaveLength(1);
});

test('accumulates no layout shift while loading', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());
  await page.addInitScript(RECORDER);

  await page.goto(`/#/map/${MAP_ID}`);
  await expect(page.locator('img[alt="Surrounds"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);

  const cls = await page.evaluate(
    () => (window as unknown as { __shifts: number[] }).__shifts.reduce((a, b) => a + b, 0),
  );
  // Google's "good" CLS threshold. A map that resizes itself twice blows past it.
  expect(cls).toBeLessThan(0.1);
});

test('does not paint pins before the view is fitted', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(seedSessionScript());

  await page.goto(`/#/map/${MAP_ID}`);

  // Sample how wide the pin layer is over the settling window: a pin painted
  // before the fit is applied is rendered against the wrong ambient scale and
  // then jumps.
  const sizes = await page.evaluate(async () => {
    const seen: number[] = [];
    const started = Date.now();
    while (Date.now() - started < 1200) {
      const node = document.querySelector('.map-pin-node') as HTMLElement | null;
      if (node) seen.push(Math.round(node.getBoundingClientRect().width));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return seen;
  });

  if (sizes.length === 0) test.skip(true, 'no pins rendered in this run');
  expect([...new Set(sizes)], 'pin layer changed size after first paint').toHaveLength(1);
});
