import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import { useAppStore } from '@/stores/appStore';
import { resetOfflineDbForTests } from '@/lib/offline/idb';
import { readSnapshot, writeSnapshot } from '@/lib/offline/snapshotCache';
import {
  resetConnectivityForTests,
  markNetworkFailure,
  markNetworkSuccess,
  isOnline,
} from '@/lib/offline/connectivity';
import type { SpaceSession } from '@/types';

const SPACE = 'space-1';

function session(role: 'gm' | 'player' = 'gm'): SpaceSession {
  return {
    space: { id: SPACE, name: 'S', invite_code: 'aa-aaa', created_at: '' } as SpaceSession['space'],
    token: 't',
    isAdmin: role === 'gm',
    role,
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
  resetConnectivityForTests();
  localStorage.clear();
  useAppStore.setState({ session: session(), sessions: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A network error shaped the way Supabase surfaces one: empty code, raw fetch
// message. `isNetworkError` keys off the empty code.
const netError = () => ({ code: '', message: 'TypeError: Failed to fetch', details: null, hint: null });

describe('useCachedCollection — hydrate then revalidate', () => {
  it('merges the cached snapshot before the network result', async () => {
    await writeSnapshot(SPACE, 'gm', 'characters', ['cached']);
    const calls: Array<[string[], string]> = [];
    let release!: (v: string[]) => void;
    const fetcher = vi.fn(() => new Promise<string[]>((r) => { release = r; }));

    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher,
        merge: (data, src) => calls.push([data, src]),
      }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual([['cached'], 'cache']);
    expect(result.current.source).toBe('cache');
    expect(result.current.status).toBe('ready');

    await act(async () => { release(['fresh']); });

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual([['fresh'], 'network']);
    expect(result.current.source).toBe('network');
  });

  it('merges once from the network when there is no snapshot', async () => {
    const calls: Array<[string[], string]> = [];
    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => ['fresh']),
        merge: (data, src) => calls.push([data, src]),
      }),
    );

    await waitFor(() => expect(result.current.source).toBe('network'));
    expect(calls).toEqual([[['fresh'], 'network']]);
  });

  // The ordering hazard: a slow IndexedDB read must never repaint stale
  // content over fresh content that already landed.
  it('discards a snapshot that resolves after the network answered', async () => {
    await writeSnapshot(SPACE, 'gm', 'characters', ['cached']);
    const calls: Array<[string[], string]> = [];

    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => ['fresh']),
        merge: (data, src) => calls.push([data, src]),
      }),
    );

    await waitFor(() => expect(result.current.source).toBe('network'));
    // Give the snapshot read every chance to land late.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(calls.filter(([, src]) => src === 'cache')).toHaveLength(0);
  });

  it('writes a snapshot after a successful fetch', async () => {
    renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => ['fresh']),
        merge: () => {},
      }),
    );

    await waitFor(async () =>
      expect(await readSnapshot(SPACE, 'gm', 'characters')).toEqual(['fresh']),
    );
  });

  it('does not write a snapshot when the fetch fails', async () => {
    renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => { throw netError(); }),
        merge: () => {},
      }),
    );

    await waitFor(() => expect(isOnline()).toBe(false));
    expect(await readSnapshot(SPACE, 'gm', 'characters')).toBeNull();
  });
});

describe('useCachedCollection — identity-preserving merges', () => {
  // Realtime pings are content-free, so most refetches return exactly what the
  // store already holds. Handing the store a fresh-but-identical array gives
  // every subscriber a new identity — every sheet memo rebuilds and the graph
  // does a full WebGL teardown. Equal payloads must not reach merge.
  it('skips the merge when a refetch returns identical content', async () => {
    const merge = vi.fn();
    // A new array each call: deep-equal, never reference-equal.
    const fetcher = vi.fn(async () => [{ id: 'a', name: 'x' }]);
    const { result } = renderHook(() =>
      useCachedCollection({ spaceId: SPACE, collection: 'characters', fetcher, merge }),
    );

    await waitFor(() => expect(result.current.source).toBe('network'));
    expect(merge).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.refetch(); });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(merge).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
  });

  it('merges again when a refetch returns different content', async () => {
    let version = 0;
    const merge = vi.fn();
    const fetcher = vi.fn(async () => [{ id: 'a', v: ++version }]);
    const { result } = renderHook(() =>
      useCachedCollection({ spaceId: SPACE, collection: 'characters', fetcher, merge }),
    );

    await waitFor(() => expect(result.current.source).toBe('network'));
    await act(async () => { await result.current.refetch(); });

    expect(merge).toHaveBeenCalledTimes(2);
  });

  it('does not re-merge a network result identical to the painted snapshot', async () => {
    await writeSnapshot(SPACE, 'gm', 'characters', ['same']);
    const calls: Array<[unknown, string]> = [];
    let release!: (v: string[]) => void;
    const fetcher = vi.fn(() => new Promise<string[]>((r) => { release = r; }));

    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher,
        merge: (d, s) => calls.push([d, s]),
      }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual([['same'], 'cache']);

    await act(async () => { release(['same']); });

    await waitFor(() => expect(result.current.source).toBe('network'));
    expect(calls).toHaveLength(1);
  });
});

describe('useCachedCollection — failure modes', () => {
  it('stays ready on a cached snapshot when the fetch fails', async () => {
    await writeSnapshot(SPACE, 'gm', 'characters', ['cached']);
    const calls: Array<[string[], string]> = [];

    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => { throw netError(); }),
        merge: (d, s) => calls.push([d, s]),
      }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current.status).toBe('ready');
    expect(result.current.source).toBe('cache');
  });

  // The case that must stay honest: an empty grimoire that looks like a real
  // empty grimoire is the worst possible output.
  it('reaches error on a first load with no snapshot and no network', async () => {
    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => { throw netError(); }),
        merge: () => {},
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.source).toBeNull();
  });

  it('flags offline for a transport error but not for an application error', async () => {
    const { unmount } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: vi.fn(async () => { throw new Error('WRONG_PASSWORD'); }),
        merge: () => {},
      }),
    );
    await waitFor(() => expect(isOnline()).toBe(true));
    unmount();

    renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'relations',
        fetcher: vi.fn(async () => { throw netError(); }),
        merge: () => {},
      }),
    );
    await waitFor(() => expect(isOnline()).toBe(false));
  });

  it('retry resets to loading and fetches again', async () => {
    let attempt = 0;
    const fetcher = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw netError();
      return ['fresh'];
    });

    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE, collection: 'characters', fetcher, merge: () => {},
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBe('network');
  });
});

describe('useCachedCollection — lifecycle', () => {
  it('is inert without a spaceId', async () => {
    const fetcher = vi.fn(async () => ['x']);
    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: undefined, collection: 'characters', fetcher, merge: () => {},
      }),
    );

    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
  });

  it('refetches on reconnect when its last attempt failed', async () => {
    let fail = true;
    const fetcher = vi.fn(async () => {
      if (fail) throw netError();
      return ['fresh'];
    });
    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE, collection: 'characters', fetcher, merge: () => {},
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    fail = false;
    await act(async () => { markNetworkSuccess(); });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('ready');
  });

  // The guard that stops the refetch storm: a collection whose last read
  // succeeded learns nothing from an online transition. Without this, a
  // persistently-failing collection and a healthy one drive each other in an
  // unbounded loop.
  it('does not refetch on reconnect when its last attempt succeeded', async () => {
    const fetcher = vi.fn(async () => ['fresh']);
    const { result } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE, collection: 'characters', fetcher, merge: () => {},
      }),
    );
    await waitFor(() => expect(result.current.source).toBe('network'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { markNetworkFailure(); });
    await act(async () => { markNetworkSuccess(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('going offline never triggers a fetch', async () => {
    const fetcher = vi.fn(async () => ['fresh']);
    renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE, collection: 'characters', fetcher, merge: () => {},
      }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    await act(async () => { markNetworkFailure(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not merge after unmount', async () => {
    const merge = vi.fn();
    let release!: (v: string[]) => void;
    const { unmount } = renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: () => new Promise<string[]>((r) => { release = r; }),
        merge,
      }),
    );

    unmount();
    await act(async () => { release(['late']); });

    expect(merge).not.toHaveBeenCalled();
  });

  // Role-keyed by construction: a player session must not read the GM snapshot.
  it('reads the snapshot for the session role only', async () => {
    await writeSnapshot(SPACE, 'gm', 'characters', ['gm-only']);
    useAppStore.setState({ session: session('player') });
    const calls: Array<[string[], string]> = [];

    renderHook(() =>
      useCachedCollection<string[]>({
        spaceId: SPACE,
        collection: 'characters',
        fetcher: () => new Promise<string[]>(() => {}),
        merge: (d, s) => calls.push([d, s]),
      }),
    );

    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toHaveLength(0);
  });
});
