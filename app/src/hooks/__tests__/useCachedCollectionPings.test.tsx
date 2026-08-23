// Realtime-ping coalescing for useCachedCollection. Separate file because it
// mocks '@/lib/db' at module level to get a controllable subscribeSpace, which
// the sibling test file must not inherit (it exercises the real localDb path).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

const listeners = new Set<() => void>();
vi.mock('@/lib/db', () => ({
  subscribeSpace: vi.fn((_spaceId: string, fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }),
}));

import { useCachedCollection } from '@/hooks/useCachedCollection';
import { useAppStore } from '@/stores/appStore';
import { resetOfflineDbForTests } from '@/lib/offline/idb';
import { resetConnectivityForTests } from '@/lib/offline/connectivity';
import type { SpaceSession } from '@/types';

const SPACE = 'space-1';

function session(): SpaceSession {
  return {
    space: { id: SPACE, name: 'S', invite_code: 'aa-aaa', created_at: '' } as SpaceSession['space'],
    token: 't',
    isAdmin: true,
    role: 'gm',
  };
}

const ping = () => listeners.forEach((fn) => fn());

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
  resetConnectivityForTests();
  listeners.clear();
  localStorage.clear();
  useAppStore.setState({ session: session(), sessions: {} });
});

describe('useCachedCollection — ping coalescing', () => {
  // A burst of writes (a pin drag, a bulk edit) broadcasts one content-free
  // ping per row change. One trailing fetch sees the final state; N fetches
  // see it N times.
  it('collapses a burst of pings into a single refetch', async () => {
    const fetcher = vi.fn(async () => ['data']);
    renderHook(() =>
      useCachedCollection({ spaceId: SPACE, collection: 'characters', fetcher, merge: () => {} }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => {
      for (let i = 0; i < 6; i += 1) ping();
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('still refetches for pings in separate windows', async () => {
    const fetcher = vi.fn(async () => ['data']);
    renderHook(() =>
      useCachedCollection({ spaceId: SPACE, collection: 'characters', fetcher, merge: () => {} }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => ping());
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    act(() => ping());
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('drops a scheduled ping refetch on unmount', async () => {
    const fetcher = vi.fn(async () => ['data']);
    const { unmount } = renderHook(() =>
      useCachedCollection({ spaceId: SPACE, collection: 'characters', fetcher, merge: () => {} }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => ping());
    unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
