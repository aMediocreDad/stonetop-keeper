import { test, expect } from '@playwright/test';
import { mockSupabase, seedSessionScript, SPACE_ID } from './fixtures/supabaseMock';

/**
 * Tone & content, verified in a real browser because the things that matter
 * here are things jsdom cannot answer: whether the page survives mounting a
 * lazy TipTap editor, whether the record actually round-trips through a save
 * and a reload, and where the Manage-locations trigger physically lands after
 * it moved out of the action row.
 *
 * The ledger check is here for a specific reason: `describeRevision` returns a
 * translation KEY, and a missing entry in `en.ts` renders the raw dotted key to
 * the user. Nothing in the unit suite guards headline-key completeness, so the
 * only way to know the string resolves is to look at rendered text.
 */

const AGREED = '<h2>Tone</h2><p>Plays it straight.</p><h2>Subject matter</h2><p>No spiders on camera.</p>';

/** Registered AFTER mockSupabase so it wins — Playwright gives the last
 *  matching route precedence. */
async function mockToneAndContent(
  page: import('@playwright/test').Page,
  opts: { initial?: string; revision?: boolean } = {},
) {
  const saved: string[] = [];
  let notes = opts.initial ?? '';

  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const json = (body: unknown) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (name === 'get_tone_and_content') {
      return route.fulfill(
        json(
          notes === ''
            ? []
            : [{ id: 'tac-1', space_id: SPACE_ID, notes, updated_at: '2026-08-22T00:00:00.000Z' }],
        ),
      );
    }
    if (name === 'save_tone_and_content') {
      const body = route.request().postDataJSON() as { p_data?: { notes?: string } };
      if (body?.p_data && 'notes' in body.p_data) {
        notes = body.p_data.notes ?? '';
        saved.push(notes);
      }
      return route.fulfill(
        json({ id: 'tac-1', space_id: SPACE_ID, notes, updated_at: '2026-08-22T00:01:00.000Z' }),
      );
    }
    if (name === 'get_revisions' && opts.revision) {
      return route.fulfill(
        json([
          {
            event_id: 'ev-1',
            at: '2026-08-22T00:01:00.000Z',
            actor_role: 'player',
            last_id: 1,
            rows: [
              {
                table_name: 'tone_and_content',
                row_id: 'tac-1',
                op: 'UPDATE',
                changed: ['notes'],
                label: 'notes',
              },
            ],
          },
        ]),
      );
    }
    return route.fallback();
  });

  return { saved: () => saved, current: () => notes };
}

test.describe('tone & content', () => {
  test('the dashboard offers it, and Manage locations has left the action row', async ({ page }) => {
    await mockSupabase(page);
    await mockToneAndContent(page);
    await page.addInitScript(seedSessionScript());
    await page.goto('/#/dashboard');

    const tone = page.getByRole('button', { name: /tone & content/i });
    await expect(tone).toBeVisible();

    // Manage locations sits in the location filter row, not the action row.
    const manage = page.getByRole('button', { name: /manage locations/i });
    await expect(manage).toBeVisible();
    const inLocationRow = await manage.evaluate((el) => {
      const row = el.parentElement;
      return !!row && !!Array.from(row.children).find((c) => c.textContent?.trim() === 'Locations');
    });
    expect(inLocationRow).toBe(true);

    // It reads as an action, not a seventh filter: dashed, and never active.
    await expect(manage).toHaveClass(/border-dashed/);
  });

  test('an empty space says so, then takes an edit and keeps it across a reload', async ({ page }) => {
    await mockSupabase(page);
    const store = await mockToneAndContent(page);
    await page.addInitScript(seedSessionScript());
    await page.goto('/#/tone-and-content');

    // The empty-state prompt, not a blank box.
    await expect(page.getByText(/nothing agreed here yet/i)).toBeVisible();

    await page.getByRole('button', { name: /^edit$/i }).click();

    // The contenteditable exposes itself as a textbox; targeting `.ProseMirror`
    // resolves to a wrapper whose click never focuses the editable node.
    const editor = page.getByRole('textbox');
    await expect(editor).toBeVisible();          // the lazy TipTap chunk mounted
    await editor.click();
    await editor.pressSequentially('Plays it straight.');

    // The hook debounces at 600ms; give it room, then prove a save happened.
    await expect.poll(() => store.saved().length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(store.current()).toContain('Plays it straight.');

    await page.reload();
    await expect(page.getByText('Plays it straight.')).toBeVisible();
    await expect(page.getByText(/nothing agreed here yet/i)).toHaveCount(0);
  });

  test('a viewer reads it and is given no way to edit it', async ({ page }) => {
    await mockSupabase(page);
    await mockToneAndContent(page, { initial: AGREED });
    // The seeded session is JSON stringified twice, so the role appears in the
    // script source as the escaped `\"role\":\"gm\"` — matching the unescaped
    // form silently does nothing and leaves the test running as a GM.
    const asViewer = seedSessionScript()
      .split('\\"role\\":\\"gm\\"')
      .join('\\"role\\":\\"viewer\\"');
    expect(asViewer).not.toEqual(seedSessionScript());   // fail loudly if the shape changes
    await page.addInitScript(asViewer);
    await page.goto('/#/tone-and-content');

    // Readable: the agreement itself and the CATS prompt both render.
    await expect(page.getByText('No spiders on camera.')).toBeVisible();
    await expect(page.getByText(/Concept · Aim · Tone · Subject matter/)).toBeVisible();
    // But no way in.
    await expect(page.getByRole('button', { name: /^edit$/i })).toHaveCount(0);
  });

  test('the ledger renders a sentence, not a raw translation key', async ({ page }) => {
    await mockSupabase(page);
    await mockToneAndContent(page, { initial: AGREED, revision: true });
    await page.addInitScript(seedSessionScript());
    await page.goto('/#/ledger');

    await expect(page.getByText(/wrote in the tone & content/i)).toBeVisible();
    await expect(page.getByText(/ledger\.headline/)).toHaveCount(0);
  });
});
