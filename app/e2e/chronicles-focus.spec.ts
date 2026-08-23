import { test, expect } from '@playwright/test';
import { mockSupabase, SPACE_ID, seedSessionScript } from './fixtures/supabaseMock';

/**
 * The chronicles focus modal is hand-rolled (it predates the shared `Modal`)
 * and now takes its scroll lock from the same `useScrollLock` — so this is the
 * page that proves the shared hook did not regress the older modal. Both facts
 * here are browser-only: whether the page behind holds still, and whether
 * focus comes back to the season card that opened it.
 *
 * The assertion is "the page did not MOVE", not "scrollY is 0": Playwright
 * scrolls a control into view before clicking it, so the page is already
 * partway down by the time the dialog opens. Pinning to 0 measures the
 * harness, not the app.
 */

const timeline = [
  {
    id: 't-1',
    space_id: SPACE_ID,
    entries: {
      '112': {
        spring: { title: 'The Thaw', body: '<p>The river broke early and the north road opened.</p>' },
        summer: { title: 'Fires', body: '<p>Three barns burned in as many weeks.</p>' },
        autumn: { title: 'The Debt', body: '<p>Ordwin came to collect.</p>' },
        winter: { title: 'Quiet', body: '<p>Nothing moved on the road.</p>' },
      },
    },
    current_year: 112,
    current_season: 'spring',
    gm_entries: {},
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

test('a focused season holds the page still, and hands focus back on close', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await mockSupabase(page);
  await page.route('**/rest/v1/rpc/get_timeline', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(timeline) }),
  );
  await page.addInitScript(seedSessionScript());
  await page.goto('/#/chronicles');
  await expect(page.getByText('The river broke early')).toBeVisible();

  // Guard the guard: a page that cannot scroll would prove nothing.
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
    'fixture is too short to test scrolling',
  ).toBe(true);

  await page.locator('.season-focus-btn').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const parked = await page.evaluate(() => window.scrollY);

  await page.mouse.move(80, 350); // over the scrim, outside the panel
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY), 'page moved under the dialog').toBe(parked);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // Focus returns to the card that opened it — the same effect that owns the
  // lock owns this, so a regression in one is a regression in the other.
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain(
    'season-focus-btn',
  );

  // And the page moves again once the lock lifts.
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(parked);
});
