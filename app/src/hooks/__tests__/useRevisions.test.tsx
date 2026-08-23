import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const getRevisions = vi.fn();
const undoEvent = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    getRevisions: (...a: unknown[]) => getRevisions(...a),
    undoEvent: (...a: unknown[]) => undoEvent(...a),
    previewUndoEvent: vi.fn(),
  },
  subscribeSpace: () => () => {},
}));

import { useRevisions } from '@/hooks/useRevisions';
import type { RevisionEvent } from '@/types';

const event = (id: string, lastId: number): RevisionEvent => ({
  event_id: id,
  at: '2026-07-25T18:00:00Z',
  actor_role: 'gm',
  last_id: lastId,
  rows: [{ table_name: 'characters', row_id: 'r', op: 'UPDATE', changed: ['notes'], label: 'Ereth' }],
});

/** Promesse pilotée à la main, pour figer un fetch "en vol" et contrôler l'ordre des évènements. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  getRevisions.mockReset();
  undoEvent.mockReset();
});

describe('useRevisions', () => {
  it('loads the first page and reports ready', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9), event('b', 5)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.events).toHaveLength(2);
  });

  it('pages with the last event id as the cursor and appends', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));

    getRevisions.mockResolvedValueOnce([event('b', 4)]);
    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(getRevisions).toHaveBeenLastCalledWith(25, 9);
    expect(hook.result.current.events.map((e) => e.event_id)).toEqual(['a', 'b']);
  });

  it('stops offering more once a short page comes back', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('surfaces a failed first load as error', async () => {
    getRevisions.mockRejectedValueOnce(new Error('LEDGER_UNAVAILABLE'));
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('error'));
  });

  it('releases the in-flight guard after a failure, so retry works', async () => {
    getRevisions.mockRejectedValueOnce(new Error('LEDGER_UNAVAILABLE'));
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('error'));

    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.events).toHaveLength(1);
  });

  it('refetches from the top after an undo', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));

    undoEvent.mockResolvedValueOnce({ event_id: 'new', rows: [] });
    getRevisions.mockResolvedValueOnce([event('new', 12), event('a', 9)]);
    await act(async () => {
      await hook.result.current.undo('a');
    });
    expect(getRevisions).toHaveBeenLastCalledWith(25, undefined);
    expect(hook.result.current.events[0].event_id).toBe('new');
  });

  it('suppresses an overlapping loadMore while a fetchFirst is still in flight', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));

    // A second fetchFirst (e.g. a realtime ping) starts and stays in flight.
    const inFlight = deferred<RevisionEvent[]>();
    getRevisions.mockReturnValueOnce(inFlight.promise);
    act(() => {
      hook.result.current.retry();
    });
    expect(getRevisions).toHaveBeenCalledTimes(2);

    // loadMore() attempted while that fetch is still unresolved must be
    // suppressed outright — appending a page onto a list that is
    // simultaneously about to be fully replaced would duplicate/corrupt it.
    getRevisions.mockResolvedValueOnce([event('never', 1)]);
    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(getRevisions).toHaveBeenCalledTimes(2);

    await act(async () => {
      inFlight.resolve([event('b', 3)]);
      await inFlight.promise;
    });
    await waitFor(() => expect(hook.result.current.events.map((e) => e.event_id)).toEqual(['b']));
    // The queued "never" page was never consumed.
    expect(getRevisions).toHaveBeenCalledTimes(2);
  });

  it('re-fires the refetch after undo instead of dropping it, when a fetch was already in flight', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));

    // Simulate a realtime ping's fetchFirst already holding the guard —
    // the same ordering the brief calls "reachable rather than theoretical".
    const inFlight = deferred<RevisionEvent[]>();
    getRevisions.mockReturnValueOnce(inFlight.promise);
    act(() => {
      hook.result.current.retry();
    });
    expect(getRevisions).toHaveBeenCalledTimes(2);

    undoEvent.mockResolvedValueOnce({ event_id: 'new', rows: [] });
    getRevisions.mockResolvedValueOnce([event('new', 12), event('a', 9)]);

    // undo()'s own fetchFirst() call lands while the guard is still held —
    // it must be queued, not silently dropped.
    await act(async () => {
      await hook.result.current.undo('a');
    });
    expect(getRevisions).toHaveBeenCalledTimes(2); // queued, not yet consumed

    await act(async () => {
      inFlight.resolve([event('a', 9)]);
      await inFlight.promise;
    });

    // After everything settles, the queued refetch must have fired and the
    // list must reflect the post-undo page — not the stale in-flight one.
    await waitFor(() => expect(hook.result.current.events[0]?.event_id).toBe('new'));
    expect(getRevisions).toHaveBeenCalledTimes(3);
  });

  it('re-fires a queued refetch when loadMore (not fetchFirst) was holding the guard', async () => {
    getRevisions.mockResolvedValueOnce([event('a', 9)]);
    const hook = renderHook(() => useRevisions('space-1'));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));

    // loadMore holds the shared guard while its page-2 SELECT is in flight.
    const page2 = deferred<RevisionEvent[]>();
    getRevisions.mockReturnValueOnce(page2.promise);
    act(() => {
      void hook.result.current.loadMore();
    });
    expect(getRevisions).toHaveBeenCalledTimes(2);

    undoEvent.mockResolvedValueOnce({ event_id: 'new', rows: [] });
    getRevisions.mockResolvedValueOnce([event('new', 12), event('a', 9)]);

    // undo()'s own fetchFirst() call lands while loadMore holds the guard —
    // it must be queued, not silently dropped, even though a *different*
    // caller (loadMore, not fetchFirst) is the one holding it.
    await act(async () => {
      await hook.result.current.undo('a');
    });
    expect(getRevisions).toHaveBeenCalledTimes(2); // queued, not yet consumed

    await act(async () => {
      page2.resolve([event('b', 4)]);
      await page2.promise;
    });

    await waitFor(() => expect(hook.result.current.events[0]?.event_id).toBe('new'));
  });
});
