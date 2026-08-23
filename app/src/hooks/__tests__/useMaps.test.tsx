import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/i18n';
import { useMaps, useMapPins } from '@/hooks/useMaps';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/lib/db';
import { localDb } from '@/lib/mockDb';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useMaps', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ session: null, sessions: {}, maps: [], characters: [], relations: [], locations: [] });
  });

  it('loads maps into the store and creates/deletes through the façade', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-AAA', password_hash: 'x' });
    localDb.createMap({ space_id: space.id, name: 'Pre-existing', gm_only: false });

    const { result } = renderHook(() => useMaps(space.id), { wrapper });
    await waitFor(() => expect(result.current.maps).toHaveLength(1));

    await act(async () => {
      await result.current.createMap({ name: 'New map' });
    });
    expect(useAppStore.getState().maps).toHaveLength(2);

    await act(async () => {
      await result.current.deleteMap(useAppStore.getState().maps[0].id);
    });
    expect(useAppStore.getState().maps).toHaveLength(1);
  });

  it('uploadImage persists dimensions and updates the store', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-AAB', password_hash: 'x' });
    const { result } = renderHook(() => useMaps(space.id), { wrapper });
    let id = '';
    await act(async () => {
      const m = await result.current.createMap({ name: 'M' });
      id = m.id;
      await result.current.uploadImage(id, {
        blob: new Blob(['x'], { type: 'image/webp' }),
        width: 800, height: 600, dataUrl: 'data:image/webp;base64,AAAA',
      });
    });
    const stored = useAppStore.getState().maps.find((m) => m.id === id);
    expect(stored?.image_width).toBe(800);
  });
});

describe('useMapPins', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ session: null, sessions: {}, maps: [], characters: [], relations: [], locations: [] });
  });

  it('loads, creates, moves and deletes pins', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-AAC', password_hash: 'x' });
    const map = localDb.createMap({ space_id: space.id, name: 'M', gm_only: false });

    const { result } = renderHook(() => useMapPins(space.id, map.id), { wrapper });
    await act(async () => {
      await result.current.createPin({ x: 0.25, y: 0.75, label: 'Camp', gm_only: false });
    });
    expect(result.current.pins).toHaveLength(1);

    await act(async () => {
      await result.current.updatePin(result.current.pins[0].id, { x: 0.5, y: 0.5 });
    });
    expect(result.current.pins[0].x).toBe(0.5);

    await act(async () => {
      await result.current.deletePin(result.current.pins[0].id);
    });
    expect(result.current.pins).toHaveLength(0);
  });

  it('clears pins synchronously when mapId changes', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'AA-AAD', password_hash: 'x' });
    const mapA = localDb.createMap({ space_id: space.id, name: 'Map A', gm_only: false });
    const mapB = localDb.createMap({ space_id: space.id, name: 'Map B', gm_only: false });

    const { result, rerender } = renderHook(
      ({ mapId }) => useMapPins(space.id, mapId),
      { wrapper, initialProps: { mapId: mapA.id } },
    );

    // Create a pin on map A and verify it loads
    await act(async () => {
      await result.current.createPin({ x: 0.25, y: 0.75, label: 'Pin A', gm_only: false });
    });
    expect(result.current.pins).toHaveLength(1);

    // Switch to map B; pins should be cleared synchronously
    rerender({ mapId: mapB.id });
    expect(result.current.pins).toHaveLength(0);

    // Verify pins stay empty after async operations
    await act(async () => {});
    expect(result.current.pins).toHaveLength(0);
  });

  it('sets pinsError to NOT_FOUND for a gm_only map when the session is a non-GM role', async () => {
    const gm = await db.createSpace('S', 'gm-pw', 'player-pw');
    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    const map = localDb.createMap({ space_id: gm.space.id, name: 'Secret', gm_only: true });

    useAppStore.setState({ session: player });

    const { result } = renderHook(() => useMapPins(gm.space.id, map.id), { wrapper });
    await waitFor(() => expect(result.current.pinsError).toBe('NOT_FOUND'));
    expect(result.current.pins).toHaveLength(0);
  });
});
