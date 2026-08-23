import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { mockSupabase, seedSessionScript, SPACE_ID } from './fixtures/supabaseMock';

/**
 * The export, exercised in a real browser, because that is the only place the
 * interesting parts exist: the lazy `import()` of the vault layer and fflate,
 * ZIP assembly over a real Blob, and the anchor-click download. Vitest sees the
 * serialiser but never the artefact a GM actually receives.
 *
 * The assertion opens the downloaded ZIP and reads the notes back out.
 */

const LOCATION_ID = '5555555a-5555-5555-5555-555555555555';

const locations = [
  {
    id: LOCATION_ID,
    space_id: SPACE_ID,
    name: 'Stonetop',
    color: '#8a7a5a',
    description: 'marsh trading town',
    notes: '<p>Founded on <em>ruins</em>.</p>',
    tags: ['home'],
    steading: null,
    gm_only: false,
    gm_notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
  },
];

const characters = [
  {
    id: '6666666a-6666-6666-6666-666666666666',
    space_id: SPACE_ID,
    name: 'Ana',
    role: 'blessed · fisher',
    type: 'PJ',
    location: LOCATION_ID,
    // The mention is in the shape the EDITOR writes — attributes and all, with
    // the visible `@Label` inside the span. This is what a real row holds.
    notes:
      '<p>Keeps the <strong>Sunken</strong> inn in ' +
      `<span data-type="mention" class="mention" data-id="${LOCATION_ID}" ` +
      'data-label="Stonetop" data-mention-suggestion-char="@">@Stonetop</span>.</p>' +
      '<ul><li>owes a debt<ul><li>to the miller</li></ul></li></ul>' +
      '<h2>Rumours</h2><p>Hears things at the bar.</p>',
    traits: [{ label: 'humorless', checked: true }],
    tags: ['warrior'],
    instinct: 'protect the weak',
    gm_only: false,
    gm_notes: null,
    dead: false,
    threat: null,
    statblock: null,
    kind: null,
    follower: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

test('exports a readable vault ZIP', async ({ page }) => {
  await mockSupabase(page);
  // Registered after the shared mock so these win for the two RPCs we care about.
  await page.route('**/rest/v1/rpc/get_characters', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(characters) }),
  );
  await page.route('**/rest/v1/rpc/get_locations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(locations) }),
  );

  await page.addInitScript(seedSessionScript());
  await page.goto('/#/dashboard');

  await page.getByRole('button', { name: /Example Campaign/ }).click();
  await page.getByRole('button', { name: 'Export the grimoire' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Characters: 1')).toBeVisible();
  await expect(dialog.getByText(/You are the GM/)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^Example Campaign — \d{4}-\d{2}-\d{2}\.zip$/);

  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const names = Object.keys(files).sort();

  expect(names).toContain('Characters/Ana.md');
  expect(names).toContain('Locations/Stonetop.md');
  expect(names).toContain('ink-and-stone.yaml');
  expect(names).toContain('README.md');
  expect(names).toContain('Views/Cast.base');

  const ana = strFromU8(files['Characters/Ana.md']);
  expect(ana).toContain('id: 6666666a-6666-6666-6666-666666666666');
  expect(ana).toContain('location: "[[Stonetop]]"');
  // The whole point of the Markdown converter: structure survives to the file.
  expect(ana).toContain('Keeps the **Sunken** inn in [[Stonetop]].');
  expect(ana).toContain('- owes a debt');
  expect(ana).toContain('  - to the miller'); // nesting, not flattened or leaked as markup
  expect(ana).toContain('- [x] humorless');
  // A mention leaves its id behind in frontmatter and its link readable.
  expect(ana).toContain(`Stonetop: ${LOCATION_ID}`);
  expect(ana).not.toContain('<span');
  // A heading the user typed sits BELOW the note's own sections, so it can never
  // be read back as one of them.
  expect(ana).toContain('##### Rumours');

  const manifest = strFromU8(files['ink-and-stone.yaml']);
  expect(manifest).toContain('role: gm');
  expect(manifest).toContain('name: Example Campaign');
  // The vault is made to be handed around; the invite code is a way in.
  expect(manifest).not.toContain('invite_code');
  expect(manifest).not.toContain('aa-aaa');
});
