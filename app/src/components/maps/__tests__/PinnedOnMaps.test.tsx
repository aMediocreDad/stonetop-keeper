import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/i18n';
import { PinnedOnMaps } from '@/components/maps/PinnedOnMaps';
import { useAppStore } from '@/stores/appStore';
import { localDb } from '@/lib/mockDb';
import type { Space } from '@/types';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>
    <MemoryRouter>{children}</MemoryRouter>
  </LanguageProvider>
);

function seedSession(space: Space) {
  useAppStore.setState({
    session: { space, isAdmin: true, token: 'mock', role: 'gm' },
    sessions: {},
    maps: [],
    characters: [],
    relations: [],
    locations: [],
  });
}

describe('PinnedOnMaps', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists the maps a character is pinned on, with worded positions', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-PIN', password_hash: 'x' });
    seedSession(space);
    const character = localDb.createCharacter({
      space_id: space.id,
      name: 'Bhael',
      role: '',
      instinct: '',
      type: 'PJ',
      notes: '',
      traits: [],
      tags: [],
      gm_only: false,
      dead: false,
    });
    const map = localDb.createMap({ space_id: space.id, name: 'The Vale', gm_only: false });
    localDb.createMapPin({
      space_id: space.id,
      map_id: map.id,
      x: 0.1,
      y: 0.2,
      character_id: character.id,
      gm_only: false,
    });

    render(<PinnedOnMaps characterId={character.id} label="On the maps" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/The Vale · north-west/)).toBeTruthy());
    expect(screen.getByText('On the maps')).toBeTruthy();
  });

  it('renders nothing when the entity is pinned nowhere', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-PIO', password_hash: 'x' });
    seedSession(space);
    localDb.createMap({ space_id: space.id, name: 'The Vale', gm_only: false });

    const { container } = render(<PinnedOnMaps characterId="nobody" label="On the maps" />, {
      wrapper,
    });
    // Give the fetch a beat, then expect silence — no label, no chips.
    await waitFor(() => expect(useAppStore.getState().maps).toHaveLength(1));
    expect(container.textContent).toBe('');
  });

  it('finds pins for a location too', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-PIP', password_hash: 'x' });
    seedSession(space);
    const location = localDb.createLocation({
      space_id: space.id,
      name: 'Stonetop',
      color: '#7AA177',
      gm_only: false,
    });
    const map = localDb.createMap({ space_id: space.id, name: 'The Vale', gm_only: false });
    localDb.createMapPin({
      space_id: space.id,
      map_id: map.id,
      x: 0.9,
      y: 0.9,
      location_id: location.id,
      gm_only: false,
    });

    render(<PinnedOnMaps locationId={location.id} />, { wrapper });
    await waitFor(() => expect(screen.getByText(/The Vale · south-east/)).toBeTruthy());
  });
});
