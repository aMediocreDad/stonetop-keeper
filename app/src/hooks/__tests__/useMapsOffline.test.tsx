import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { useMaps, resetMapSweepsForTests } from '@/hooks/useMaps';
import { db } from '@/lib/db';
import { localDb } from '@/lib/mockDb';
import { useAppStore } from '@/stores/appStore';
import { resetOfflineDbForTests } from '@/lib/offline/idb';
import { resetConnectivityForTests } from '@/lib/offline/connectivity';
import { getMapBlob } from '@/lib/offline/mapBlobs';
import type { CampaignMap } from '@/types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
  resetConnectivityForTests();
  resetMapSweepsForTests();
  localStorage.clear();
  useAppStore.setState({ session: null, sessions: {}, maps: [] });
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
});

function seedSpaceWithMaps(code: string, count: number) {
  const space = localDb.createSpace({ name: 'S', invite_code: code, password_hash: 'x' });
  for (let i = 0; i < count; i++) {
    const m = localDb.createMap({ space_id: space.id, name: `m${i}`, gm_only: false });
    localDb.updateMap(m.id, { image_path: `maps/${m.id}.webp` });
  }
  return space;
}

describe('useMaps — offline image sweep', () => {
  // The reported bug: the Maps page sat on "0 of 3 maps saved for offline"
  // forever, and showed it again on every navigation.
  //
  // Cache hydration starts sweep 1. The network result then replaces the
  // `maps` array, which (a) cancels sweep 1's setSavedCount and (b) makes
  // sweep 2 return early on the in-flight guard WITHOUT rescheduling. Nothing
  // ever writes the count, and it is component-local state that resets to 0
  // on every mount.
  it('reports the real saved count even when maps change mid-sweep', async () => {
    const space = seedSpaceWithMaps('MAP001', 3);
    vi.spyOn(db, 'fetchMapImageBytes').mockImplementation(
      async (m: CampaignMap) => new Blob([m.id], { type: 'image/webp' }),
    );

    const { result } = renderHook(() => useMaps(space.id));

    await waitFor(() => expect(result.current.offlineImages.total).toBe(3));
    await waitFor(() => expect(result.current.offlineImages.saved).toBe(3), { timeout: 4000 });
  });

  // The real-world interleaving, which only bites when downloads are slow
  // enough to still be running when the next `maps` array arrives — i.e. real
  // multi-MB images over a real network, not an instant fake.
  it('converges when a realtime refresh lands mid-download', async () => {
    const space = seedSpaceWithMaps('MAP006', 3);
    vi.spyOn(db, 'fetchMapImageBytes').mockImplementation(
      async (m: CampaignMap) => {
        await new Promise((r) => setTimeout(r, 60));
        return new Blob([m.id], { type: 'image/webp' });
      },
    );

    const { result } = renderHook(() => useMaps(space.id));
    await waitFor(() => expect(result.current.offlineImages.total).toBe(3));

    // A fresh array with identical content — exactly what a realtime ping or a
    // cache→network handoff produces, and enough to re-run the effect.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
      useAppStore.setState((s) => ({ maps: [...s.maps] }));
    });

    await waitFor(() => expect(result.current.offlineImages.saved).toBe(3), { timeout: 6000 });
  });

  it('actually writes the bytes to IndexedDB', async () => {
    const space = seedSpaceWithMaps('MAP002', 2);
    vi.spyOn(db, 'fetchMapImageBytes').mockImplementation(
      async (m: CampaignMap) => new Blob([m.id], { type: 'image/webp' }),
    );

    const { result } = renderHook(() => useMaps(space.id));
    await waitFor(() => expect(result.current.offlineImages.saved).toBe(2), { timeout: 4000 });

    for (const m of result.current.maps) {
      expect(await getMapBlob(space.id, m)).not.toBeNull();
    }
  });

  // Re-mounting is what navigating away and back does. The count must reflect
  // what is already stored, not restart from zero.
  it('reports the stored count immediately on a later mount, without re-downloading', async () => {
    const space = seedSpaceWithMaps('MAP003', 3);
    const fetchBytes = vi
      .spyOn(db, 'fetchMapImageBytes')
      .mockImplementation(async (m: CampaignMap) => new Blob([m.id], { type: 'image/webp' }));

    const first = renderHook(() => useMaps(space.id));
    await waitFor(() => expect(first.result.current.offlineImages.saved).toBe(3), { timeout: 4000 });
    first.unmount();

    const callsAfterFirst = fetchBytes.mock.calls.length;
    useAppStore.setState({ maps: [] });

    const second = renderHook(() => useMaps(space.id));
    await waitFor(() => expect(second.result.current.offlineImages.saved).toBe(3), { timeout: 4000 });
    // Nothing left to fetch — the bytes are already there.
    expect(fetchBytes.mock.calls.length).toBe(callsAfterFirst);
  });

  // The banner is noise once there is nothing left to do.
  it('only reports syncing while a download is actually outstanding', async () => {
    const space = seedSpaceWithMaps('MAP004', 2);
    vi.spyOn(db, 'fetchMapImageBytes').mockImplementation(
      async (m: CampaignMap) => new Blob([m.id], { type: 'image/webp' }),
    );

    const { result } = renderHook(() => useMaps(space.id));
    await waitFor(() => expect(result.current.offlineImages.saved).toBe(2), { timeout: 4000 });

    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(result.current.offlineImages.syncing).toBe(false);
  });

  // The guard is module-scoped for exactly this: two hook instances alive at
  // once (Maps page + viewer overlapping during navigation) must share one
  // sweep, not run the same multi-MB downloads twice in parallel.
  it('does not double-download when two hook instances mount together', async () => {
    const space = seedSpaceWithMaps('MAP007', 3);
    const fetchBytes = vi
      .spyOn(db, 'fetchMapImageBytes')
      .mockImplementation(async (m: CampaignMap) => {
        await new Promise((r) => setTimeout(r, 40));
        return new Blob([m.id], { type: 'image/webp' });
      });

    const a = renderHook(() => useMaps(space.id));
    const b = renderHook(() => useMaps(space.id));

    await waitFor(() => expect(a.result.current.offlineImages.saved).toBe(3), { timeout: 6000 });
    expect(fetchBytes.mock.calls.length).toBe(3);
    b.unmount();
    a.unmount();
  });

  // Without a backend there is nothing to download; the sweep must not spin or
  // log a failure per map on every render.
  it('does not attempt a sweep when the backend cannot serve bytes', async () => {
    const space = seedSpaceWithMaps('MAP005', 2);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useMaps(space.id));
    await waitFor(() => expect(result.current.offlineImages.total).toBe(2));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(result.current.offlineImages.saved).toBe(0);
    expect(result.current.offlineImages.syncing).toBe(false);
    expect(err).not.toHaveBeenCalled();
  });
});
