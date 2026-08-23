import { test, expect } from '@playwright/test';
import { mockSupabase, SPACE_ID, seedSessionScript } from './fixtures/supabaseMock';

/**
 * Hover-reveal geometry — invisible to Vitest, which has no layout.
 *
 * The invariant: a control revealed by `group-hover` must not have a hit box
 * larger than the element that owns the hover. The remove button's padding
 * (a thumb-sized tap target) used to be cancelled with a negative margin, so
 * its border box overflowed the 20px row by 8px on every side — and because
 * `:hover` propagates to ancestors, the pointer resting in the blank card
 * padding *above* or *beside* a row kept that row's button lit.
 */

const journal = [
  {
    id: 'j-1',
    space_id: SPACE_ID,
    notes: '<p>Some notes</p>',
    wonders: [
      { id: 'w-1', text: 'Who burned the mill?', resolved: false, created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'w-2', text: 'What lies below?', resolved: false, created_at: '2026-08-01T00:00:00.000Z' },
      // Answered but un-annotated: this row carries a SECOND hover-revealed
      // control ("Add a note"), so it is the taller, two-affordance case.
      { id: 'w-3', text: 'Where is the crown?', resolved: true, created_at: '2026-08-01T00:00:00.000Z' },
    ],
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

test('a wonder row only reveals its remove button while the pointer is inside the row', async ({
  page,
}) => {
  await mockSupabase(page);
  await page.route('**/rest/v1/rpc/get_gm_journal', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(journal) }),
  );
  await page.addInitScript(seedSessionScript());
  await page.goto('/#/gm');
  await expect(page.getByText('Who burned the mill?')).toBeVisible();

  const boxOf = (i: number) =>
    page.evaluate((n) => {
      const r = (document.querySelectorAll('li.group')[n] as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    }, i);

  /**
   * Opacity of every hover-revealed control in row `i` — the remove button and,
   * on an answered row, "Add a note". The answer button (first of the row) is
   * always visible and is excluded.
   */
  const revealed = async (i: number, x: number, y: number) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    return page.evaluate((n) => {
      const li = document.querySelectorAll('li.group')[n] as HTMLElement;
      return Array.from(li.querySelectorAll('button'))
        .slice(1)
        .map((b) => getComputedStyle(b).opacity);
    }, i);
  };

  const assertRow = async (i: number, label: string) => {
    const box = await boxOf(i);
    const cx = box.x + box.w - 12; // over the remove button, inside the row
    const cy = box.y + box.h / 2;

    // Inside the row: revealed.
    expect(await revealed(i, cx, cy), `${label} — inside`).not.toContain('0');

    // Just outside the row's border box, on every side: hidden. 4px is the
    // realistic case — a pointer drifting off the row, not teleporting away.
    expect(await revealed(i, cx, box.y - 4), `${label} — above`).not.toContain('1');
    expect(await revealed(i, cx, box.bottom + 4), `${label} — below`).not.toContain('1');
    expect(await revealed(i, box.right + 4, cy), `${label} — right`).not.toContain('1');
    expect(await revealed(i, box.x - 4, cy), `${label} — left`).not.toContain('1');
  };

  await assertRow(0, 'open row');

  // The answered list is collapsed by default; its rows are the interesting
  // case here (two hover-revealed controls, taller box), so unfold it.
  // Anchored: "Mark as answered" (a row's own toggle) also contains the word.
  await page.getByRole('button', { name: /^answered \(\d+\)$/i }).click();
  await expect(page.getByText('Where is the crown?')).toBeVisible();
  await assertRow(2, 'answered row');
});
