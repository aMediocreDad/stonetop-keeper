import { test, expect } from '@playwright/test';
import { mockSupabase, SPACE_ID, seedSessionScript } from './fixtures/supabaseMock';

/**
 * Two things jsdom cannot answer: which column a card actually lands in, and
 * whether the page behind an open modal still takes the wheel.
 */

/** Long enough that the page genuinely overflows the viewport. */
const journal = [
  {
    id: 'j-1',
    space_id: SPACE_ID,
    notes: '<p>The smith knows more than they say.</p>',
    wonders: Array.from({ length: 30 }, (_, i) => ({
      id: `w-${i}`,
      text: `Open question number ${i} about the campaign?`,
      resolved: false,
      created_at: '2026-08-01T00:00:00.000Z',
    })),
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

async function gotoJournal(page: import('@playwright/test').Page) {
  await mockSupabase(page);
  await page.route('**/rest/v1/rpc/get_gm_journal', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(journal) }),
  );
  await page.addInitScript(seedSessionScript());
  await page.goto('/#/gm');
  await expect(page.getByText('Open question number 0')).toBeVisible();
}

/** Visible children of the page grid, in DOM order. */
const gridBoxes = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelector('main .grid')!.children)
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
      }),
  );

test('wide screens put the wonders and the notes side by side, 2:3', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoJournal(page);

  const boxes = await gridBoxes(page);
  // The seal divider is stacked-layout furniture; between columns it is gone.
  expect(boxes).toHaveLength(2);

  const [wonders, notes] = boxes;
  expect(wonders.y, 'columns start on the same line').toBe(notes.y);
  expect(notes.x, 'notes sit to the right of the wonders').toBeGreaterThan(wonders.x);
  // 2/5 vs 3/5 of the row, so notes are ~1.5x the wonders. Tolerant of the gap.
  expect(notes.w / wonders.w).toBeGreaterThan(1.3);
  expect(notes.w / wonders.w).toBeLessThan(1.7);
});

test('below the breakpoint they stack, divider and all', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await gotoJournal(page);

  const boxes = await gridBoxes(page);
  expect(boxes, 'wonders, seal divider, notes').toHaveLength(3);
  expect(boxes[0].x).toBe(boxes[2].x);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
});

test('the page does not scroll behind an open modal', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await gotoJournal(page);

  // Guard the guard: if the page could not scroll, this would prove nothing.
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  );
  expect(scrollable, 'fixture is too short to test scrolling').toBe(true);

  await page.getByText('The smith knows more than they say.').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Where the page sits once the dialog is up — Playwright scrolls a target
  // into view before clicking it, so this is not necessarily 0. The invariant
  // is that it does not MOVE from here.
  const parked = await page.evaluate(() => window.scrollY);

  // Over the scrim, then over the panel: the overlay is a fixed layer with
  // nothing of its own to scroll, so an unlocked page takes the wheel — this
  // took the journal 1241px down before the lock existed.
  await page.mouse.move(120, 350);
  await page.mouse.wheel(0, 600);
  await page.mouse.move(550, 350);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY), 'page moved under the dialog').toBe(parked);

  // And the lock lifts — a page you can never scroll again is the other bug.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(parked);
});
