import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/i18n';
import { useSteading } from '@/hooks/useSteading';
import { useAppStore } from '@/stores/appStore';
import { localDb } from '@/lib/mockDb';
import { mergePendingSteading, pendingSteading } from '@/lib/steading/steading';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useSteading', () => {
  beforeEach(() => {
    localStorage.clear();
    pendingSteading.clear();
    useAppStore.setState({ locations: [], characters: [], relations: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('setupSteading creates a Stonetop location with the seed', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AAA111', password_hash: 'x' });
    const { result } = renderHook(() => useSteading(space.id), { wrapper });

    await act(async () => {
      await result.current.setupSteading();
    });

    const locs = useAppStore.getState().locations;
    expect(locs).toHaveLength(1);
    expect(locs[0].name).toBe('Stonetop');
    expect(locs[0].steading?.improvements).toHaveLength(17);
    // persisté, pas seulement en store
    expect(localDb.getSpaceLocations(space.id)[0].steading?.stats.fortunes).toBe(1);
  });

  it('setupSteading upgrades an existing location named Stonetop instead of duplicating', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AAA112', password_hash: 'x' });
    const existing = localDb.createLocation({ space_id: space.id, name: 'Stonetop', color: '#7AA177', gm_only: false });
    useAppStore.setState({ locations: [existing] });

    const { result } = renderHook(() => useSteading(space.id), { wrapper });
    await act(async () => {
      await result.current.setupSteading();
    });

    const locs = useAppStore.getState().locations;
    expect(locs).toHaveLength(1);
    expect(locs[0].id).toBe(existing.id);
    expect(locs[0].steading).toBeTruthy();
  });

  it('mutateSteading updates the store immediately and persists after the debounce', async () => {
    vi.useFakeTimers();
    const space = localDb.createSpace({ name: 'S', invite_code: 'AAA113', password_hash: 'x' });
    const { result } = renderHook(() => useSteading(space.id), { wrapper });
    await act(async () => {
      await result.current.setupSteading();
    });
    const locId = useAppStore.getState().locations[0].id;

    act(() => {
      result.current.mutateSteading(locId, (s) => ({
        ...s,
        stats: { ...s.stats, surplus: s.stats.surplus + 1 },
      }));
      result.current.mutateSteading(locId, (s) => ({
        ...s,
        stats: { ...s.stats, surplus: s.stats.surplus + 1 },
      }));
    });

    // optimiste : store à jour tout de suite
    expect(useAppStore.getState().locations[0].steading?.stats.surplus).toBe(3);
    // pas encore persisté (debounce)
    expect(localDb.getSpaceLocations(space.id)[0].steading?.stats.surplus).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    // une seule écriture, valeur finale
    expect(localDb.getSpaceLocations(space.id)[0].steading?.stats.surplus).toBe(3);
  });

  it('a realtime refetch during the debounce does not clobber the pending edit', async () => {
    vi.useFakeTimers();
    const space = localDb.createSpace({ name: 'S', invite_code: 'AAA114', password_hash: 'x' });
    const { result } = renderHook(() => useSteading(space.id), { wrapper });
    await act(async () => {
      await result.current.setupSteading();
    });
    const locId = useAppStore.getState().locations[0].id;

    act(() => {
      result.current.mutateSteading(locId, (s) => ({
        ...s,
        stats: { ...s.stats, surplus: s.stats.surplus + 1 },
      }));
    });

    // Simule le refetch temps réel : liste périmée venant de la BD,
    // passée par le même merge que useLocations.
    const stale = localDb.getSpaceLocations(space.id);
    expect(stale[0].steading?.stats.surplus).toBe(1); // BD encore périmée
    useAppStore.setState({ locations: mergePendingSteading(stale) });

    // L'édition en attente survit au refetch…
    expect(useAppStore.getState().locations[0].steading?.stats.surplus).toBe(2);

    // …et c'est bien elle qui est persistée au flush.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(localDb.getSpaceLocations(space.id)[0].steading?.stats.surplus).toBe(2);
    expect(pendingSteading.size).toBe(0); // registre nettoyé après sauvegarde
  });

  it('setupSteading never reseeds an existing steading sheet', async () => {
    vi.useFakeTimers();
    const space = localDb.createSpace({ name: 'S', invite_code: 'AAA115', password_hash: 'x' });
    const { result } = renderHook(() => useSteading(space.id), { wrapper });
    await act(async () => {
      await result.current.setupSteading();
    });
    const locId = useAppStore.getState().locations[0].id;
    act(() => {
      result.current.mutateSteading(locId, (s) => ({
        ...s,
        stats: { ...s.stats, surplus: 5 },
      }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    await act(async () => {
      await result.current.setupSteading(); // deuxième clic CTA
    });
    expect(useAppStore.getState().locations).toHaveLength(1);
    expect(useAppStore.getState().locations[0].steading?.stats.surplus).toBe(5);
  });
});
