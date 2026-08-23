import { test, expect } from '@playwright/test';
import { seedSessionScript, SPACE_ID } from './fixtures/supabaseMock';

/**
 * La grille du grimoire, vérifiée dans un vrai navigateur parce que ce qui a
 * changé n'est visible que peint : la largeur réelle d'une carte (c'est elle
 * qui décide si un nom tient), l'ordonnée du lieu d'une carte à l'autre (le
 * rail de bas de carte), et le cas à deux pastilles qui remet de la pression
 * sur la ligne du nom.
 *
 * jsdom ne mesure rien de tout ça — il rend `line-clamp-2` et `mt-auto` comme
 * des chaînes de classes.
 */

const LOCATION_ID = '5555555a-5555-5555-5555-555555555555';

const locations = [{
  id: LOCATION_ID,
  space_id: SPACE_ID,
  name: 'Stonetop',
  color: '#8a7a5a',
  description: null,
  notes: '',
  tags: [],
  gm_only: false,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
}];

const stamp = {
  space_id: SPACE_ID,
  notes: '',
  instinct: '',
  traits: [],
  tags: [],
  location: LOCATION_ID,
  gm_only: false,
  gm_notes: '',
  dead: false,
  threat: null,
  statblock: null,
  kind: null,
  follower: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const characters = [
  // Un PJ dont le rôle porte un livret connu — tampon de livret, doré.
  { ...stamp, id: 'c0000001-0000-0000-0000-000000000001', name: 'Aruun',
    role: 'Lightbearer · Burning Soul', type: 'PJ', instinct: 'rekindle the old flame' },
  // Un PJ SANS livret analysable : le trou d'avant — il sortait sans tampon,
  // donc sans rien qui dise son type une fois les pastilles parties.
  { ...stamp, id: 'c0000002-0000-0000-0000-000000000002', name: 'Cadmor',
    role: 'village blacksmith', type: 'PJ', instinct: 'keep the forge lit' },
  // Notes en prose : la seule fiche à mentionner « tithe », donc la seule que
  // la recherche élargie peut trouver — et celle qui doit dire POURQUOI.
  { ...stamp, id: 'c0000003-0000-0000-0000-000000000003', name: 'Eurwen',
    role: "the miller's widow", type: 'PNJ',
    notes: '<p>Still owes the hall a tithe of grain from the wet autumn.</p>',
    traits: [{ label: 'sharp-tongued', checked: false }, { label: 'grieving', checked: false }] },
  // Le cas à DEUX pastilles (MJ + décédé) sur un nom long : c'est exactement
  // la configuration qui tronquait « Aftermat… » avant le line-clamp.
  { ...stamp, id: 'c0000004-0000-0000-0000-000000000004',
    name: 'Bhael of the Long Watch', role: 'militia captain', type: 'PNJ',
    dead: true, gm_only: true, traits: [{ label: 'one-eyed', checked: false }] },
  { ...stamp, id: 'c0000005-0000-0000-0000-000000000005', name: 'The Marshedge Levy',
    role: 'sworn spears', type: 'GROUPE', dead: true },
  // Une menace en cours : la pastille compte ses présages cochés.
  { ...stamp, id: 'c0000006-0000-0000-0000-000000000006', name: 'Aftermath of the Flood',
    role: '', type: 'MENACE', gm_only: true, kind: 'hazard',
    instinct: 'drown the vale before the thaw',
    threat: { type: 'affliction', instinct: '', stakes: [], gmMoves: [],
      portents: [
        { text: 'the well runs foul', done: true },
        { text: 'the herds sicken', done: false },
        { text: 'the mill wheel splits', done: false },
      ],
      impendingDoom: { text: '<p>the vale drowns before the thaw</p>', done: false } } },
  // Fiche de menace PARTIELLE — un objet sans portents/impendingDoom/stakes.
  // Forme bien vivante en base (fiches d'avant la refonte 2026-07), et celle
  // qui faisait planter la carte quand elle lisait le bloc brut.
  { ...stamp, id: 'c0000008-0000-0000-0000-000000000008', name: 'Revenants of the Gwead',
    role: '', type: 'MENACE', kind: 'undead',
    threat: { type: 'rabble' } },
  // Une menace dont la fatalité est tombée : la pastille cède au rouge.
  { ...stamp, id: 'c0000007-0000-0000-0000-000000000007', name: 'The Hagr',
    role: '', type: 'MENACE', kind: 'beast', tags: ['ancient'],
    threat: { type: 'beast', instinct: '', stakes: [], gmMoves: [],
      portents: [{ text: 'tracks by the water', done: true }],
      impendingDoom: { text: '<p>it takes a child from Stonetop</p>', done: true } } },
];

async function mockGrid(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const body =
      name === 'get_characters' ? characters
        : name === 'get_locations' ? locations
          : name === 'get_relations' || name === 'get_maps' || name === 'get_map_pins'
            || name === 'get_revisions' ? []
            : null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/realtime/v1/**', (route) => route.abort());
  await page.addInitScript(seedSessionScript());
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await mockGrid(page);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Aruun' })).toBeVisible();
});

test('no name is truncated, not even with two chips on a long one', async ({ page }) => {
  for (const name of ['Aftermath of the Flood', 'Bhael of the Long Watch', 'The Marshedge Levy']) {
    const heading = page.getByRole('heading', { name });
    // `line-clamp-2` autorise le retour à la ligne mais pas la coupe : le
    // contenu ne doit jamais déborder de la boîte (c'est ce que `truncate`
    // faisait, en mangeant la fin du nom).
    const clipped = await heading.evaluate(
      (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    );
    expect(clipped, `"${name}" is clipped in the card header`).toBe(false);
  }
});

test('the location line lands on one rail across a row', async ({ page }) => {
  const cards = page.locator('.card-accent-left');
  const count = await cards.count();
  expect(count).toBeGreaterThan(5);

  // Ordonnée du bas de chaque lien de lieu, groupée par rangée de grille.
  const rows = new Map<number, number[]>();
  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const cardBox = await card.boundingBox();
    const locBox = await card.getByRole('link', { name: 'Stonetop' }).boundingBox();
    if (!cardBox || !locBox) continue;
    const rowKey = Math.round(cardBox.y / 50);
    rows.set(rowKey, [...(rows.get(rowKey) ?? []), Math.round(locBox.y + locBox.height)]);
  }

  expect(rows.size).toBeGreaterThan(1);
  for (const [row, bottoms] of rows) {
    const spread = Math.max(...bottoms) - Math.min(...bottoms);
    expect(spread, `row ${row} location line drifts by ${spread}px`).toBeLessThanOrEqual(1);
  }
});

test('type badges are gone from the grid, state chips are not', async ({ page }) => {
  const grid = page.locator('.card-accent-left');
  for (const badge of ['NPC', 'PC', 'Group', 'Threat']) {
    await expect(grid.getByText(badge, { exact: true })).toHaveCount(0);
  }
  await expect(grid.getByText('Deceased', { exact: true })).toHaveCount(1);
  await expect(grid.getByText('Disbanded', { exact: true })).toHaveCount(1);
  // Ticked portents on a threat in progress, then the fallen doom.
  // The quotient is no longer painted: since the card rework it is filled/empty
  // pips, with the count left to assistive tech (the `sr-only` span) and to the
  // `title`. Assert what the card actually renders, not the old "1/3".
  await expect(grid.getByText('1 / 3', { exact: true })).toHaveCount(1);
  // A fallen doom is no longer a text chip either: the card fills EVERY pip and
  // turns them red (--danger #9B2C20). That colour is the only thing that
  // distinguishes it from an ordinary complete track, so it is what we assert.
  const doomPips = grid.locator('p[title="1/1"] span[aria-hidden="true"] > span');
  await expect(doomPips).toHaveCount(1);
  await expect(doomPips.first()).toHaveCSS('background-color', 'rgb(155, 44, 32)');
});

test('a partial threat sheet renders instead of taking the grid down', async ({ page }) => {
  // Pas d'ErrorBoundary, pas de carte manquante : la fiche partielle se rend
  // comme les autres, simplement sans pastille d'avancement.
  const card = page.locator('.card-accent-left', { hasText: 'Revenants of the Gwead' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Rabble')).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});

test('the drive line carries instincts, and never the doom', async ({ page }) => {
  // Session MJ (seedSessionScript) : l'instinct sort sur tous les types.
  await expect(page.getByText('to rekindle the old flame')).toBeVisible();
  await expect(page.getByText('to drown the vale before the thaw')).toBeVisible();
  await expect(page.getByText('the vale drowns before the thaw')).toHaveCount(0);
  // Un PJ sans livret analysable garde un tampon — sinon sa carte ne dirait
  // plus rien de son type depuis que les pastilles sont parties.
  const cadmor = page.locator('.card-accent-left', { hasText: 'village blacksmith' });
  await expect(cadmor.locator('.stamp-icon')).toHaveCount(1);
});

/** La modale de bienvenue s'ouvre au premier chargement d'un grimoire. */
async function dismissWhatsNew(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Back to the grimoire' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  await expect(dismiss).toBeHidden();
}

test.describe('the search bar', () => {
  test.beforeEach(async ({ page }) => {
    await dismissWhatsNew(page);
  });

  test('« / » puts the cursor in the field from anywhere on the page', async ({ page }) => {
    const field = page.getByRole('searchbox', { name: 'Search the grimoire' });
    await page.locator('h1').click();
    await expect(field).not.toBeFocused();
    await page.keyboard.press('/');
    await expect(field).toBeFocused();
    // La touche ne doit pas s'écrire dans le champ qu'elle vient d'ouvrir.
    await expect(field).toHaveValue('');
    // …et une fois dedans, elle redevient un caractère ordinaire.
    await page.keyboard.press('/');
    await expect(field).toHaveValue('/');
  });

  test('the count line says how much of the grimoire is showing', async ({ page }) => {
    // Scopé à `main` : le bandeau hors-ligne et le toast sont aussi des
    // régions live, et vivent tous deux hors du contenu.
    const status = page.locator('main').getByRole('status');
    await expect(status).toHaveText('');
    await page.getByRole('searchbox', { name: 'Search the grimoire' }).fill('eurwen');
    await expect(status).toHaveText('1 of 8 shown');
  });

  test('the clear button and Escape both empty the field', async ({ page }) => {
    const field = page.getByRole('searchbox', { name: 'Search the grimoire' });
    await field.fill('eurwen');
    await expect(page.locator('.card-accent-left')).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear the search' }).click();
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await expect(page.locator('.card-accent-left')).toHaveCount(8);

    await field.fill('eurwen');
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await expect(page.locator('.card-accent-left')).toHaveCount(8);
  });

  test('prose is searchable, and the card says where the words came from', async ({ page }) => {
    const field = page.getByRole('searchbox', { name: 'Search the grimoire' });
    // « tithe » n'est écrit NULLE PART sur une carte : il vit dans les notes.
    await field.fill('tithe');
    const card = page.locator('.card-accent-left');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { name: 'Eurwen' })).toBeVisible();
    // La carte doit donc dire d'où vient le mot, et le montrer en contexte.
    const why = card.locator('p', { has: page.locator('.label-overline') });
    await expect(why).toContainText(/notes/i);
    await expect(why).toContainText('owes the hall a tithe of grain');

    // Deux mots = deux exigences, chacune n'importe où dans la fiche.
    await field.fill('eurwen tithe');
    await expect(card).toHaveCount(1);
    await field.fill('cadmor tithe');
    await expect(page.locator('.card-accent-left')).toHaveCount(0);
  });

  test('search screenshot', async ({ page }) => {
    // Deux états qui ne se voient que peints : le champ au repos (touche « / »
    // posée à droite) et le champ en train de chercher (croix d'encre, ligne
    // de compte, et la carte qui dit d'où vient le mot).
    const field = page.getByRole('searchbox', { name: 'Search the grimoire' });
    await page.screenshot({ path: 'test-results/search-idle.png', clip: { x: 0, y: 250, width: 1280, height: 260 } });
    await field.fill('tithe');
    await expect(page.locator('main').getByRole('status')).toHaveText('1 of 8 shown');
    await page.locator('h1').click();
    await page.screenshot({ path: 'test-results/search-active.png', clip: { x: 0, y: 250, width: 1280, height: 560 } });
  });

  test('a name outranks a mention buried in prose', async ({ page }) => {
    // « grain » est dans les notes d'Eurwen ; « Grain » n'est le nom de
    // personne, donc on cherche un mot que DEUX fiches portent autrement.
    await page.getByRole('searchbox', { name: 'Search the grimoire' }).fill('the');
    // Les huit fiches portent « the » quelque part ; la ligne de compte est le
    // point de synchronisation (le champ est débouncé, et lire la grille sans
    // attendre revient à lire l'ordre d'AVANT la recherche).
    await expect(page.locator('main').getByRole('status')).toHaveText('8 of 8 shown');
    const names = await page.locator('.card-accent-left h3').allInnerTexts();
    expect(names.length).toBeGreaterThan(2);
    // Les fiches dont le NOM porte le mot passent devant celles qui ne le
    // portent que dans leur rôle ou leur prose.
    const named = names.filter((n) => /\bthe\b/i.test(n));
    expect(named.length).toBeGreaterThan(0);
    expect(names.slice(0, named.length)).toEqual(named);
  });
});

test('grid screenshot', async ({ page }) => {
  await dismissWhatsNew(page);
  // `test-results/` est déjà ignoré par git — la capture est une pièce à
  // conviction pour relire la grille, pas un artefact à versionner.
  await page.screenshot({ path: 'test-results/character-grid.png', fullPage: true });
});
