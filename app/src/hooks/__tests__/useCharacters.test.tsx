import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCharacters } from '@/hooks/useCharacters';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/lib/db';
import { localDb } from '@/lib/mockDb';

// Statut de chargement : sans lui, « ça charge », « c'est vide » et « ça a
// échoué » arrivent tous comme `[]` — les pages affichaient notFound ou
// « grimoire vide » pendant chaque aller-retour réseau.
describe('useCharacters — statut de chargement', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ session: null, sessions: {}, characters: [], relations: [], locations: [], maps: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const seedSpace = () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-AAA', password_hash: 'x' });
    localDb.createCharacter({
      space_id: space.id,
      name: 'Arvid',
      type: 'PNJ',
      role: '',
      instinct: '',
      notes: '',
      tags: [],
      traits: [],
      gm_only: false,
      dead: false,
    });
    return space;
  };

  it('passe loading → ready quand le premier fetch aboutit', async () => {
    const space = seedSpace();
    const { result } = renderHook(() => useCharacters(space.id));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.characters).toHaveLength(1);
  });

  it('passe en error si le premier fetch échoue, puis ready après retry', async () => {
    const space = seedSpace();
    const spy = vi
      .spyOn(db, 'getSpaceCharacters')
      .mockRejectedValueOnce(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useCharacters(space.id));
    await waitFor(() => expect(result.current.status).toBe('error'));
    // L'échec ne doit pas passer pour un grimoire vide côté données non plus.
    expect(result.current.characters).toHaveLength(0);

    // La connexion revient : retry repasse par loading puis aboutit.
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.characters).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
  });

  it("garde ready si un refetch (ping realtime) échoue après un premier succès", async () => {
    const space = seedSpace();
    const { result } = renderHook(() => useCharacters(space.id));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    vi.spyOn(db, 'getSpaceCharacters').mockRejectedValueOnce(new Error('flaky'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      await result.current.fetchCharacters();
    });

    // Données un peu périmées > mur d'erreur : le statut ne régresse pas.
    expect(result.current.status).toBe('ready');
    expect(result.current.characters).toHaveLength(1);
  });
});
