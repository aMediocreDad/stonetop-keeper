import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// `.env.local` fournit de vraies creds Supabase (nécessaires à `npm run dev`),
// mais Vitest les charge aussi : sans ce stub, `db.ts` ciblerait le vrai
// Supabase au lieu du seam `localDb` attendu par ce test.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { LanguageProvider } from '@/i18n';
import { ChronicleAnnals } from '@/components/timeline/ChronicleAnnals';
import { localDb } from '@/lib/mockDb';

// La modale plein écran embarque Tiptap (lourd et fragile en jsdom) : on la
// neutralise — on ne teste ici que l'ouverture sur la bonne cible.
vi.mock('@/components/shared/RichText', () => ({
  RichText: () => <div data-testid="tiptap-stub" />,
}));

const renderAnnals = (spaceId: string) =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <ChronicleAnnals spaceId={spaceId} />
      </LanguageProvider>
    </MemoryRouter>,
  );

const makeSpace = (code: string) =>
  localDb.createSpace({ name: 'S', invite_code: code, password_hash: 'x' });

describe('ChronicleAnnals', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Ce projet n'active pas `test.globals` dans vitest.config.ts : le nettoyage
  // automatique de Testing Library (qui détecte un `afterEach` global) ne se
  // déclenche pas. Sans cet appel explicite, le DOM des tests précédents
  // (rendus via `screen`, portée document entier) persiste et fausse les
  // assertions suivantes.
  afterEach(() => {
    cleanup();
  });

  it('renders recorded years ascending, seasons in order, empties omitted', async () => {
    const space = makeSpace('ANL301');
    localDb.saveTimeline(space.id, {
      space_id: space.id,
      updated_at: '2026-01-01T00:00:00Z',
      entries: {
        '3': { winter: { body: '<p>the siege</p>' } },
        // Année 1 volontairement déclarée été avant printemps : l'ordre
        // d'affichage doit suivre les saisons, pas l'objet.
        '1': { summer: { body: '<p>the drought</p>' }, spring: { title: 'Ambush', body: '<p>gwead</p>' } },
        '2': { spring: { body: '<p></p>' } }, // vide → année masquée
      },
      current_year: 3,
      current_season: 'winter',
    });

    const { container } = renderAnnals(space.id);

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Year 1', 'Year 3']);
    expect(container.querySelector('#annals-year-2')).toBeNull();

    const year1Cards = container.querySelectorAll('#annals-year-1 .season');
    expect([...year1Cards].map((c) => c.className)).toEqual([
      expect.stringContaining('season-spring'),
      expect.stringContaining('season-summer'),
    ]);

    // L'entrée « saison actuelle » (hiver an 3) porte le sceau.
    expect(container.querySelector('#annals-year-3 .annals-current-seal')).not.toBeNull();
    expect(container.querySelector('#annals-year-1 .annals-current-seal')).toBeNull();
  });

  it('clicking an entry opens the focus modal on that year and season', async () => {
    const space = makeSpace('ANL302');
    localDb.saveTimeline(space.id, {
      space_id: space.id,
      updated_at: '2026-01-01T00:00:00Z',
      entries: { '3': { winter: { body: '<p>the siege</p>' } } },
      current_year: 3,
      current_season: 'winter',
    });

    const { container } = renderAnnals(space.id);
    await screen.findAllByRole('heading', { level: 2 });

    fireEvent.click(container.querySelector('#annals-year-3 .season-display')!);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toContain('Year 3');
    expect(dialog.getAttribute('aria-label')).toContain('Winter');
  });

  it('empty timeline shows the empty state, not a bare Year 0', async () => {
    const space = makeSpace('ANL303');

    renderAnnals(space.id);

    expect(
      await screen.findByText(/record an entry to begin the annals/i),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();

    // « Consigner une entrée » ouvre la modale sur le prochain créneau
    // (printemps de l'an 0 pour une frise vierge).
    fireEvent.click(screen.getByRole('button', { name: 'Record entry' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toContain('Year 0');
    expect(dialog.getAttribute('aria-label')).toContain('Spring');
  });
});
