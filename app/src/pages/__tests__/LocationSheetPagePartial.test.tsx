import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const updateLocation = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const locationsMock = vi.hoisted(() => [
  {
    id: 'loc-1', space_id: 'space-1', name: 'Marshedge', color: '#7AA177',
    description: 'a river town', notes: 'smells of peat', tags: ['town'],
    // gm_notes '' and not null on purpose: the draft seeds `gm_notes ?? ''`
    // and the save sends the string back, so a row still holding null gets one
    // normalising write on its next save. The no-op property below is about a
    // row with nothing left to normalise.
    gm_only: false, gm_notes: '', steading: null,
    created_at: '2026-07-01T00:00:00Z',
  },
]);

vi.mock('@/hooks/useLocations', () => ({
  useLocations: () => ({ locations: locationsMock, status: 'loaded', retry: vi.fn(), updateLocation }),
}));
vi.mock('@/hooks/useCharacters', () => ({ useCharacters: () => ({ characters: [] }) }));
vi.mock('@/hooks/useSteading', () => ({
  useSteading: () => ({ mutateSteading: vi.fn(), promoteLocation: vi.fn() }),
}));
vi.mock('@/hooks/useTimeline', () => ({ useTimeline: () => ({ timeline: [] }) }));
vi.mock('@/hooks/useRole', () => ({ useCanEdit: () => true, useIsGm: () => true }));
vi.mock('@/components/shared/RichText', () => ({ RichText: () => null }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/timeline/ChronicleBacklinks', () => ({ ChronicleBacklinks: () => null }));

import LocationSheetPage from '@/pages/LocationSheetPage';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';

function renderPage() {
  useAppStore.setState({
    session: {
      space: { id: 'space-1', name: 'Toa', invite_code: 'X', created_at: '', updated_at: '' },
      isAdmin: true, token: 'tok', role: 'gm',
    },
  });
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/location/loc-1']}>
        <Routes><Route path="/location/:id" element={<LocationSheetPage />} /></Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

afterEach(() => cleanup());
beforeEach(() => updateLocation.mockClear());

describe('LocationSheetPage — partial saves', () => {
  it('sends only the renamed field', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('Marshedge'), { target: { value: 'Marshedge Ford' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(updateLocation).toHaveBeenCalled());
    const sent = updateLocation.mock.calls[0][1];
    expect(sent.name).toBe('Marshedge Ford');
    for (const untouched of ['description', 'notes', 'tags', 'gm_only']) {
      expect(Object.keys(sent)).not.toContain(untouched);
    }
  });

  it('does not call the RPC when nothing changed', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(updateLocation).not.toHaveBeenCalled());
  });
});
