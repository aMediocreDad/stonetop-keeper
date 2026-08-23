import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// `.env.local` carries real Supabase creds (npm run dev needs them) and Vitest
// loads it too — without this stub db.ts would target the real backend instead
// of the seam mocked below.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

// `subscribeSpace` is NOT optional here: useCachedCollection.ts:2 imports it
// from this same module, so a mock that omits it makes the hook throw on mount.
vi.mock('@/lib/db', () => ({
  db: {
    getToneAndContent: vi.fn(),
    saveToneAndContent: vi.fn(),
  },
  subscribeSpace: vi.fn(() => () => {}),
}));

import { LanguageProvider } from '@/i18n';
import { useToneAndContent } from '@/hooks/useToneAndContent';
import { db, subscribeSpace } from '@/lib/db';

// The hook calls useT() for its save-error toast, so it needs the i18n context.
const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(db.getToneAndContent).mockReset().mockResolvedValue(null);
  vi.mocked(db.saveToneAndContent).mockReset().mockResolvedValue({
    id: 'tac-1', space_id: 's1', notes: '', updated_at: 't-saved',
  });
  vi.mocked(subscribeSpace).mockReset();
  vi.mocked(subscribeSpace).mockImplementation(() => () => {});
});
afterEach(() => vi.useRealTimers());

describe('useToneAndContent', () => {
  it('debounces a note into one save', async () => {
    const { result } = renderHook(() => useToneAndContent('s1'), { wrapper });
    // Never null, even before the initial fetch has resolved.
    expect(result.current.record.notes).toBe('');
    // Flush the mocked (already-resolved) initial fetch's microtasks — no
    // timer is involved in the first load, so nothing needs advancing.
    await act(async () => {});
    expect(result.current.loaded).toBe(true);
    act(() => result.current.updateNotes('<h2>Tone</h2>'));
    act(() => result.current.updateNotes('<h2>Tone</h2><p>Straight.</p>'));
    expect(db.saveToneAndContent).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(db.saveToneAndContent).toHaveBeenCalledTimes(1);
    expect(db.saveToneAndContent).toHaveBeenCalledWith('s1', {
      notes: '<h2>Tone</h2><p>Straight.</p>',
    });
  });

  it('flushes a pending note on unmount rather than dropping it', async () => {
    const { result, unmount } = renderHook(() => useToneAndContent('s1'), { wrapper });
    act(() => result.current.updateNotes('<p>no spiders</p>'));
    unmount();
    // Fake timers stay armed and are never advanced here: the 600ms debounce
    // provably cannot have fired on its own, so only the unmount flush
    // explains this call. (Flushing microtasks, not real time, is all the
    // flush itself needs — it calls `save` directly, with no timer.)
    await act(async () => {});
    expect(db.saveToneAndContent).toHaveBeenCalledWith('s1', {
      notes: '<p>no spiders</p>',
    });
  });

  // Ported from useGmJournal.test.tsx's "a realtime refetch keeps locally
  // dirty notes but adopts remote wonders" (narrowed to one field): this is
  // the test that actually distinguishes the dirty-union merge from a plain
  // `setRecord(next)` overwrite. Without the merge guard, the refetch's
  // remote value would win and `record.notes` would come back as the
  // "stale remote" string below instead of the local edit.
  it('a realtime refetch keeps a locally dirty note instead of the remote value', async () => {
    let onChange: () => void = () => {};
    vi.mocked(subscribeSpace).mockImplementation((_id, cb) => {
      onChange = cb;
      return () => {};
    });
    vi.mocked(db.getToneAndContent)
      .mockResolvedValueOnce({ id: 'tac-1', space_id: 's1', notes: '<p>old</p>', updated_at: 't1' })
      .mockResolvedValueOnce({
        id: 'tac-1', space_id: 's1', notes: '<p>remote, never saw my edit</p>', updated_at: 't2',
      });

    const { result } = renderHook(() => useToneAndContent('s1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load
    act(() => result.current.updateNotes('<p>mine</p>')); // dirty, debounce pending

    await act(async () => {
      onChange(); // realtime ping -> refetch resolves the second value
      await vi.runOnlyPendingTimersAsync();
    });

    // Local text survives the hydration. (id/updated_at are deliberately not
    // asserted here: the debounce timer for this same edit is also pending
    // and fires within the same `runOnlyPendingTimersAsync`, so a real save
    // follows the merge and legitimately updates those fields afterwards —
    // asserting on them would pin that ordering instead of the merge itself.)
    expect(result.current.record.notes).toBe('<p>mine</p>');
  });

  // Ported from useGmJournal.test.tsx's "keeps a field dirty after a failed
  // save so a later refetch does not overwrite it" — pins the rule that a
  // failed save must never clear the dirty marker.
  it('keeps a note dirty after a failed save so a later refetch does not overwrite it', async () => {
    let onChange: () => void = () => {};
    vi.mocked(subscribeSpace).mockImplementation((_id, cb) => {
      onChange = cb;
      return () => {};
    });
    vi.mocked(db.getToneAndContent)
      .mockResolvedValueOnce({ id: 'tac-1', space_id: 's1', notes: '<p>old</p>', updated_at: 't1' })
      // Refetch triggered AFTER the failed save below: if the failure wrongly
      // cleared the dirty marker, this stale value silently wins.
      .mockResolvedValueOnce({
        id: 'tac-1', space_id: 's1', notes: '<p>stale remote, never saw my edit</p>', updated_at: 't2',
      });
    vi.mocked(db.saveToneAndContent).mockRejectedValueOnce(new Error('network drop'));

    const { result } = renderHook(() => useToneAndContent('s1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load
    act(() => result.current.updateNotes('<p>mine</p>'));
    await act(() => vi.advanceTimersByTimeAsync(700)); // debounce fires, save rejects
    expect(db.saveToneAndContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      onChange(); // realtime ping after the failed save
      await vi.runOnlyPendingTimersAsync();
    });
    // Never persisted — must still be treated as dirty, so the refetch must
    // NOT adopt the remote value in its place.
    expect(result.current.record.notes).toBe('<p>mine</p>');
  });

  // Ported from useGmJournal.test.tsx's "keeps a mid-flight edit that starts
  // during a refetch's round trip" — the "after" half of the dirty union:
  // clean when the GET starts, dirty by the time it resolves.
  //
  // The `advanceTimersByTimeAsync(250)` below is load-bearing, not filler.
  // `onChange()` only ARMS useCachedCollection's 250ms ping-coalescing
  // timer; the fetcher (and its `dirtyBeforeRef` sample at
  // useToneAndContent.ts:52) does not run until that timer fires. Without
  // this advance, `updateNotes` below would land BEFORE the fetcher ever
  // runs, so `dirtyBeforeRef` would sample `true` too — collapsing "before"
  // and "after" into the same value and leaving a before-only merge
  // (`dirtyBeforeRef.current` with no `|| dirtyRef.current !== null`)
  // equally able to pass this test. Advancing past the window first forces
  // the fetcher to sample a clean "before", so the edit that follows is only
  // visible via the "after" term — a before-only merge now fails here (see
  // the fix report for the mutation check confirming this).
  it("keeps a mid-flight edit that starts during a refetch's round trip", async () => {
    let onChange: () => void = () => {};
    vi.mocked(subscribeSpace).mockImplementation((_id, cb) => {
      onChange = cb;
      return () => {};
    });
    vi.mocked(db.getToneAndContent).mockResolvedValueOnce({
      id: 'tac-1', space_id: 's1', notes: '<p>old</p>', updated_at: 't1',
    });

    const { result } = renderHook(() => useToneAndContent('s1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load, clean

    let resolveGet!: (value: { id: string; space_id: string; notes: string; updated_at: string } | null) => void;
    const pending = new Promise<{ id: string; space_id: string; notes: string; updated_at: string } | null>(
      (resolve) => {
        resolveGet = resolve;
      },
    );
    vi.mocked(db.getToneAndContent).mockReturnValueOnce(pending);

    // Ping arrives while nothing is dirty yet.
    act(() => {
      onChange();
    });
    // Advance past the 250ms coalescing window: the fetcher runs NOW, samples
    // `dirtyBeforeRef = false`, and calls `db.getToneAndContent`, which
    // returns the still-pending promise above — the round trip is in flight.
    await act(() => vi.advanceTimersByTimeAsync(250));

    // Types WHILE the GET above is still in flight — only visible to an
    // "after" snapshot taken once the round trip resolves.
    act(() => result.current.updateNotes('<p>mine mid-flight</p>'));

    await act(async () => {
      resolveGet({
        id: 'tac-1', space_id: 's1',
        notes: '<p>remote, unrelated to the mid-flight edit</p>', updated_at: 't2',
      });
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.record.notes).toBe('<p>mine mid-flight</p>');
  });
});
