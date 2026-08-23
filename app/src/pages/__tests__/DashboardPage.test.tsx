import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const charactersMock = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/hooks/useCharacters', () => ({
  useCharacters: () => ({ characters: charactersMock.list, status: 'loaded', retry: vi.fn() }),
}));
vi.mock('@/hooks/useLocations', () => ({ useLocations: () => ({ locations: [] }) }));
vi.mock('@/hooks/useRole', () => ({ useCanEdit: () => true, useIsGm: () => true }));
// The grid's contents are what this suite reads; the card has its own tests.
vi.mock('@/components/character/CharacterCard', () => ({
  CharacterCard: ({ character }: { character: { id: string; name: string } }) => (
    <div data-testid="card">{character.name}</div>
  ),
}));
vi.mock('@/components/locations/LocationBanner', () => ({ LocationBanner: () => null }));
vi.mock('@/components/locations/LocationsManagerModal', () => ({ LocationsManagerModal: () => null }));
vi.mock('@/components/modals/WhatsNewModal', () => ({ WhatsNewModal: () => null }));
vi.mock('@/components/character/CharacterForm', () => ({ CharacterForm: () => null }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));

import DashboardPage from '@/pages/DashboardPage';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { Character } from '@/types';

const base: Character = {
  id: 'x', space_id: 'space-1', name: '', role: '', type: 'PNJ', notes: '',
  instinct: '', traits: [], tags: [], gm_only: false, dead: false, gm_notes: null,
  created_at: '2026-08-17T00:00:00Z', updated_at: '2026-08-17T00:00:00Z',
};

const cast: Character[] = [
  { ...base, id: 'n1', name: 'Elios', type: 'PNJ', role: 'farmer' },
  { ...base, id: 'd1', name: 'Bronze plate', type: 'DISCOVERY', role: 'arcanum' },
  { ...base, id: 'd2', name: 'Muddy prints', type: 'DISCOVERY', role: 'clue' },
  { ...base, id: 'd3', name: 'The old barrow', type: 'DISCOVERY', role: '' },
];

function renderDashboard() {
  charactersMock.list = cast;
  useAppStore.setState({
    session: { space: { id: 'space-1', name: 'Toa', invite_code: 'X', created_at: '', updated_at: '' },
      isAdmin: true, token: 'tok', role: 'gm' },
    characters: cast,
    locations: [],
    searchQuery: '',
    filterType: 'all',
    filterLocationId: 'all',
  });
  return render(
    <LanguageProvider>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </LanguageProvider>,
  );
}

const shown = () => screen.getAllByTestId('card').map((el) => el.textContent);

afterEach(() => cleanup());
beforeEach(() => {
  useAppStore.setState({ filterType: 'all' });
});

describe('the Discoveries chip', () => {
  it('is offered, and filters the grid to discoveries', () => {
    renderDashboard();
    expect(shown()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Discoveries' }));
    expect(shown().sort()).toEqual(['Bronze plate', 'Muddy prints', 'The old barrow']);
  });

  it('shows the subtype chips only while it is active', () => {
    renderDashboard();
    expect(screen.queryByRole('button', { name: 'All kinds' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discoveries' }));
    expect(screen.getByRole('button', { name: 'All kinds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Arcanum' })).toBeTruthy();
  });

  it('narrows to one kind, and treats an unfiled row as neither', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Discoveries' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clue' }));
    expect(shown()).toEqual(['Muddy prints']);
    // `role = ''` is a real state, not a wildcard: it must not appear under a
    // kind it was never filed as.
    expect(shown()).not.toContain('The old barrow');
  });

  it('drops the subtype narrowing when the type filter moves', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Discoveries' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clue' }));
    // `dashboard.typeNPC` is 'NPC' — singular, unlike 'Groups'/'Threats'.
    fireEvent.click(screen.getByRole('button', { name: 'NPC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discoveries' }));
    // A narrowing left behind would silently hide two rows with nothing on
    // screen still saying "Clue".
    expect(shown()).toHaveLength(3);
  });
});

describe('the Manage locations chip', () => {
  it('offers Manage locations from the location row, not the action row', () => {
    renderDashboard(); // the suite's existing helper, GM/player role
    const manage = screen.getByRole('button', { name: /manage locations/i });
    // It sits inside the location filter row, next to the last location chip.
    // 'Locations' is dashboard.locationsLabel; the row is its parent div.
    const row = screen.getByText('Locations').closest('div');
    expect(row?.contains(manage)).toBe(true);
    // …and it reads as an action, not a seventh filter.
    expect(manage.className).toContain('border-dashed');
  });
});
