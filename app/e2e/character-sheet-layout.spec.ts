import { test, expect } from '@playwright/test';
import { seedSessionScript, SPACE_ID } from './fixtures/supabaseMock';

/**
 * Character-sheet layout, verified in a real browser because none of it is
 * visible to jsdom: paint order across stacking contexts, computed field
 * heights, and which column a card actually lands in.
 *
 * The regression that prompted this: `.card-accent-left` sets
 * `isolation: isolate` (it anchors the ripple frieze at z-index:-1), which
 * makes the Informations card a stacking context — so the location picker's
 * dropdown, z-30 and all, painted UNDER the cards below it. A unit test can
 * assert the menu is in the DOM; only a browser can say what covers it.
 */

const NPC_ID = '44444444-4444-4444-4444-444444444444';

const locations = ['Gordin\'s Delve', 'Marshedge', 'Stonetop', 'The Foothills', 'The Great Wood']
  .map((name, i) => ({
    id: `5555555${i}-5555-5555-5555-555555555555`,
    space_id: SPACE_ID,
    name,
    color: '#8a7a5a',
    description: null,
    notes: '',
    tags: [],
    gm_only: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }));

const threat = {
  id: NPC_ID,
  space_id: SPACE_ID,
  name: 'The Hagr',
  role: 'the hagr of the wood',
  type: 'MENACE',
  notes: '',
  instinct: 'kill',
  traits: [],
  tags: ['foreshadowed'],
  location: undefined,
  gm_only: true,
  gm_notes: '',
  threat: {
    type: 'beast',
    instinct: '',
    portents: [],
    stakes: [],
    gmMoves: [],
    impendingDoom: { text: '', done: false },
  },
  statblock: {
    hp: 12,
    armor: 1,
    armorNote: 'thick hide',
    damage: 'claws d8 (close, forceful)',
    specialQualities: 'Sees in the dark',
    moves: ['Vanish into the trees'],
  },
  // Colonnes propres depuis supabase-statblock.sql : la catégorie de
  // bestiaire et la couche follower ne vivent plus dans le bloc.
  kind: 'beast',
  follower: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

// Un PNJ ordinaire, statté et non-follower : le sujet de la bascule Follower.
// Une MENACE ne peut PAS en être un (supabase-statblock.sql), donc la case ne
// lui est pas offerte et la marque « MJ seul » ne part jamais de son bloc.
const NPC_ID_PLAIN = '77777777-7777-7777-7777-777777777777';

const npc = {
  ...threat,
  id: NPC_ID_PLAIN,
  name: 'Maren the Smith',
  role: 'smith',
  type: 'PNJ',
  instinct: 'finish what she started',
  tags: [],
  gm_only: false,
  threat: null,
  kind: 'npc',
  follower: null,
};

async function mockSheet(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const body =
      name === 'get_characters' ? [threat, npc]
        : name === 'get_locations' ? locations
          : name === 'get_relations' || name === 'get_maps' || name === 'get_map_pins'
            || name === 'get_revisions' ? []
            : null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/realtime/v1/**', (route) => route.abort());
  await page.addInitScript(seedSessionScript());
}

test('the location dropdown paints above the cards below it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID}`);

  await page.getByRole('button', { name: 'Edit' }).click();
  const picker = page.getByRole('button', { name: /Pick a location/ });
  await picker.scrollIntoViewIfNeeded();
  await picker.click();

  // The dropdown panel itself — the only `.card-paper.shadow-lg` on the sheet.
  const menu = page.locator('.card-paper.shadow-lg');
  await expect(menu).toBeVisible();

  const infoCard = page.getByText('Information', { exact: true }).locator('..');
  const [menuBox, cardBox] = await Promise.all([menu.boundingBox(), infoCard.boundingBox()]);

  // Guard the guard: if the menu fitted inside the card there would be nothing
  // to escape, and the paint assertion below would pass even with the bug.
  expect(menuBox!.y + menuBox!.height,
    'menu does not overhang the card — this test would prove nothing')
    .toBeGreaterThan(cardBox!.y + cardBox!.height);

  // Ask the browser what is actually painted just inside the menu's bottom
  // edge — the part that overhangs the next card. Before the fix, that point
  // hit the threat card: `.card-accent-left`'s `isolation: isolate` trapped
  // the menu's z-30 inside the Informations card's stacking context.
  const covering = await menu.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight) return 'out-of-viewport';
    const hit = document.elementFromPoint(r.x + r.width / 2, r.bottom - 6);
    if (!hit) return 'nothing-hit';
    return el.contains(hit) ? null : (hit.className || hit.tagName);
  });
  expect(covering, 'something paints over the bottom of the location menu').toBeNull();

  // And it is clickable through to the field, not merely visible: the menu
  // closes and the trigger is the only thing left carrying the name.
  await page.getByRole('button', { name: 'The Great Wood' }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'The Great Wood' })).toHaveCount(1);
});

test('the location field is a sheet row, not a form field (matches the other selects)', async ({ page }) => {
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID}`);
  await page.getByRole('button', { name: 'Edit' }).click();

  const picker = page.getByRole('button', { name: /Pick a location/ });
  const select = page.getByLabel(/^Type$/);
  const pickerH = (await picker.boundingBox())!.height;
  const selectH = (await select.boundingBox())!.height;

  expect(pickerH).toBeLessThanOrEqual(34);
  expect(Math.abs(pickerH - selectH)).toBeLessThanOrEqual(1);
});

test('desktop: the stat block sits in the right column, above Bonds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID}`);

  // Remonter jusqu'à la CARTE par sa classe, pas par un nombre de `..` : la
  // profondeur d'un en-tête change dès qu'on lui ajoute ou retire un
  // conteneur, et le test se mettait alors à mesurer la boîte intérieure
  // (décalée du p-6 de la carte) en croyant mesurer la colonne.
  const card = (label: string) =>
    page.getByText(label, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"card-paper")][1]');
  const statblock = card('Stat block');
  const bonds = card('Bonds');
  const info = card('Information');

  const [sb, bd, inf] = await Promise.all([
    statblock.boundingBox(), bonds.boundingBox(), info.boundingBox(),
  ]);

  // Right column: starts after the Informations card ends horizontally.
  expect(sb!.x).toBeGreaterThan(inf!.x + inf!.width);
  // Above Bonds, sharing the column.
  expect(sb!.y + sb!.height).toBeLessThanOrEqual(bd!.y);
  expect(Math.abs(sb!.x - bd!.x)).toBeLessThanOrEqual(2);
});

test('GM-only fields say so: instinct and a non-follower stat block are marked', async ({ page }) => {
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID_PLAIN}`);

  await expect(page.getByTitle(/Only you can see this instinct/)).toBeVisible();
  await expect(page.getByTitle(/Only you can see this stat block/)).toBeVisible();

  // Ticking Follower reveals the sheet to players — both marks must go.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Follower', exact: true }).click();
  await expect(page.getByTitle(/Only you can see this instinct/)).toHaveCount(0);
  await expect(page.getByTitle(/Only you can see this stat block/)).toHaveCount(0);
});

test('a threat gets no Role field and no Follower toggle — its mechanics stay GM prep', async ({ page }) => {
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID}`);

  // Une menace est de la prep de MJ, et rien ne peut l'en sortir : pas de
  // bascule Follower, donc les deux marques « MJ seul » restent.
  await expect(page.getByTitle(/Only you can see this instinct/)).toBeVisible();
  await expect(page.getByTitle(/Only you can see this stat block/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: 'Follower', exact: true })).toHaveCount(0);
  // « Monstre » reste : c'est le tampon du bestiaire, pas la couche follower.
  await expect(page.getByRole('button', { name: 'Monster', exact: true })).toBeVisible();
  // Et pas de champ Rôle : son archétype est son type de menace. Le texte
  // stocké de l'ancienne fiche n'est plus affiché nulle part.
  await expect(page.getByRole('textbox', { name: /^Role/ })).toHaveCount(0);
  await expect(page.getByText('the hagr of the wood')).toHaveCount(0);
});

/**
 * Le type de menace se lit sous le nom, en italique — plus en troisième
 * pastille. Vérifié dans un navigateur parce que c'est une question de mise
 * en page : l'assertion porte sur la POSITION de la ligne (sous le titre,
 * alignée à gauche avec lui), ce que jsdom ne sait pas dire.
 */
test('the threat type reads under the name, not as a third badge', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID}`);

  const heading = page.getByRole('heading', { name: 'The Hagr' });
  // Le type de menace PUIS les tags, comme sur la carte du grimoire : depuis
  // que les tags ont quitté leur section propre, cette ligne les porte aussi
  // (« Beast, foreshadowed ») — c'est l'anatomie du livre.
  const descriptor = page.getByText('Beast, foreshadowed', { exact: true });
  const typeBadge = page.getByText('Threat', { exact: true });

  const [h, d, b] = await Promise.all([
    heading.boundingBox(), descriptor.boundingBox(), typeBadge.boundingBox(),
  ]);

  // Sous le titre, et calé sur sa marge gauche.
  expect(d!.y).toBeGreaterThanOrEqual(h!.y + h!.height - 2);
  expect(Math.abs(d!.x - h!.x)).toBeLessThanOrEqual(2);
  // Et surtout PAS sur la ligne des pastilles.
  expect(d!.y).toBeGreaterThan(b!.y + b!.height - 2);
});

/**
 * Le parcours de création complet : nom + type, puis la fiche s'ouvre en
 * édition avec ses brouillons DÉJÀ hydratés. Le piège est là — l'effet de
 * synchro s'interdit de tourner pendant l'édition, donc basculer trop tôt
 * laisse des champs vides et le premier Save vide la ligne.
 */
test('creating an entry lands on its sheet in edit mode, fields populated', async ({ page }) => {
  await mockSheet(page);

  // Mock volontairement À ÉTAT : la fiche remonte `get_characters` à son
  // montage, donc une réponse figée ferait disparaître la ligne qu'on vient
  // de créer et la page dirait « introuvable » — ce qui ressemblerait à un
  // bug d'édition. Enregistré APRÈS mockSheet (le dernier routeur gagne) ;
  // `fallback()` rend la main pour tout le reste.
  const created: unknown[] = [];
  const newRow = {
    ...threat, id: '66666666-6666-6666-6666-666666666666',
    name: 'Bryn', role: '', type: 'PNJ', tags: [], instinct: '',
    gm_only: false, threat: null, statblock: null, kind: null,
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (name === 'create_character') {
      created.push(newRow);
      return json(newRow);
    }
    if (name === 'get_characters') return json([threat, ...created]);
    return route.fallback();
  });

  await page.goto('/#/dashboard');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Name').fill('Bryn');
  await page.getByRole('button', { name: 'Create character' }).click();

  // On est sur la fiche, en édition, et le nom est déjà dans le champ.
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Bryn');
});

/**
 * La carte Informations est une grille libellé/contrôle : tous les contrôles
 * démarrent sur la même colonne. En `flex` par ligne, chacun commençait où
 * finissait SON libellé — « Type », « Rôle », « Instinct », « Lieu » partaient
 * chacun d'un x différent et la carte se lisait en escalier. Seul un vrai
 * navigateur peut le dire : jsdom ne pose rien.
 */
test('every control in the Informations card starts on the same column', async ({ page }) => {
  await mockSheet(page);
  await page.goto(`/#/character/${NPC_ID_PLAIN}`);
  await page.getByRole('button', { name: 'Edit' }).click();

  // `.contents` n'existe que sur les FieldRow : leur dernier enfant est la
  // cellule de contrôle. Viser la grille par sa classe Tailwind
  // (`grid-cols-[max-content_...]`) demanderait un sélecteur échappé illisible,
  // et un simple `.grid` attrape d'abord la grille de colonnes de la page.
  const lefts = await page.locator('.contents').first().evaluate(() => {
    const cells = [...document.querySelectorAll('.contents > div')] as HTMLElement[];
    return cells.map((c) => Math.round(c.getBoundingClientRect().left));
  });
  expect(lefts.length, 'no control cells found — selector is wrong').toBeGreaterThan(3);
  expect(Math.max(...lefts) - Math.min(...lefts),
    `controls start at ${[...new Set(lefts)].join(', ')}px`).toBeLessThanOrEqual(1);

  await page.screenshot({ path: 'test-results/sheet-information.png', fullPage: false });
});
