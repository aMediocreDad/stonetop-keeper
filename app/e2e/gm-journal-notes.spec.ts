import { test, expect } from '@playwright/test';
import { mockSupabase, SPACE_ID, seedSessionScript } from './fixtures/supabaseMock';

/**
 * GM notes read-then-focus (motif des Chroniques). Two things Vitest cannot
 * see: that the page mounts NO ProseMirror instance until the modal is
 * opened, and that closing the modal inside the 600ms debounce window still
 * persists the last keystrokes (the timer lives in `useGmJournal`, which the
 * modal's unmount does not touch — this test is what proves it).
 */

const journal = [
  {
    id: 'j-1',
    space_id: SPACE_ID,
    notes: '<p>The smith knows more than they say.</p>',
    wonders: [],
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

test('GM notes render as prose, edit in a modal, and save after closing', async ({ page }) => {
  const saved: string[] = [];

  await mockSupabase(page);
  await page.route('**/rest/v1/rpc/get_gm_journal', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(journal) }),
  );
  await page.route('**/rest/v1/rpc/save_gm_journal', (route) => {
    const body = route.request().postDataJSON() as { p_data?: { notes?: string } };
    if (typeof body?.p_data?.notes === 'string') saved.push(body.p_data.notes);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...journal[0], updated_at: '2026-08-02T00:00:00.000Z' }),
    });
  });
  await page.addInitScript(seedSessionScript());
  await page.goto('/#/gm');

  // --- reads as prose, with no editor mounted ---------------------------
  const prose = page.getByText('The smith knows more than they say.');
  await expect(prose).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);

  // --- click the prose -> modal with a real editor -----------------------
  await prose.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const editor = modal.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();

  // --- type, then close immediately (inside the debounce window) ---------
  await editor.click();
  await editor.pressSequentially(' They lie.');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  // The debounce timer survives the close and persists the edit.
  await expect
    .poll(() => saved.join('|'), { timeout: 5_000 })
    .toContain('They lie.');

  // Back on the page, the prose shows the new text and no editor lingers.
  await expect(page.getByText(/They lie\./)).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
});

/**
 * Enough prose to overflow at the WIDEST the panel gets (896px, where each of
 * these wraps to two lines) — a shorter fixture fit on desktop and quietly
 * stopped testing the scroll.
 */
const LONG = Array.from(
  { length: 30 },
  (_, i) =>
    `<p>Paragraph ${i + 1}. The smith knows more than they say, and the north road has not been safe since the thaw — three carts went up the pass and only one of them ever came back down again.</p>`,
).join('');

async function openNotes(page: import('@playwright/test').Page, notes: string) {
  await mockSupabase(page);
  await page.route('**/rest/v1/rpc/get_gm_journal', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ ...journal[0], notes }]),
    }),
  );
  await page.addInitScript(seedSessionScript());
  await page.goto('/#/gm');
  await page.getByRole('button', { name: /edit the gm notes/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The panel enters at scale 0.95 over 0.2s; measuring geometry before that
  // settles reads the animation, not the layout (it showed x=7 on a 390px
  // viewport that is meant to be full-bleed).
  await page.waitForTimeout(500);
}

test('a long note scrolls inside the editor instead of stretching the modal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openNotes(page, LONG);

  const geo = await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]') as HTMLElement;
    const scroller = panel.querySelector('.tiptap-fill') as HTMLElement;
    const r = panel.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      viewportH: window.innerHeight,
      scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
    };
  });

  // Capped to the viewport, and fully on screen — the earlier `h-full` version
  // resolved its percentage against an indefinite height and hung 185px off
  // the top of the window.
  expect(geo.top, 'panel hangs off the top').toBeGreaterThanOrEqual(0);
  expect(geo.bottom).toBeLessThanOrEqual(geo.viewportH);
  expect(geo.scrollable, 'the editor should be the thing that scrolls').toBe(true);

  // The wheel moves the prose, not the page.
  await page.mouse.move(640, 500);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    editor: (document.querySelector('.tiptap-fill') as HTMLElement).scrollTop,
    page: window.scrollY,
  }));
  expect(after.editor).toBeGreaterThan(0);
  expect(after.page).toBe(0);

  // The toolbar stays put while the prose moves under it.
  await expect(page.getByRole('button', { name: /bold/i })).toBeVisible();
});

test('on a phone the notes modal is full-bleed, not a card in a wide margin', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openNotes(page, LONG);

  const box = await page.evaluate(() => {
    const r = (document.querySelector('[role="dialog"]') as HTMLElement).getBoundingClientRect();
    return {
      x: Math.round(r.x),
      w: Math.round(r.width),
      h: Math.round(r.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
  expect(box.x).toBe(0);
  expect(box.w).toBe(box.vw);
  expect(box.h).toBe(box.vh);
});
