import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// `.env.local` fournit de vraies creds Supabase (nécessaires à `npm run dev`),
// mais Vitest les charge aussi : sans ce stub, `db.ts` ciblerait le vrai
// Supabase au lieu du seam mocké ci-dessous.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

vi.mock('@/lib/db', () => ({
  db: {
    getGmJournal: vi.fn(),
    saveGmJournal: vi.fn(),
  },
  subscribeSpace: vi.fn(() => () => {}),
}));

import { LanguageProvider } from '@/i18n';
import { useGmJournal } from '@/hooks/useGmJournal';
import { db, subscribeSpace } from '@/lib/db';
import type { GmJournal } from '@/types';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useGmJournal', () => {
  beforeEach(() => {
    vi.mocked(db.getGmJournal).mockReset();
    vi.mocked(db.saveGmJournal).mockReset();
    // Sane default so `await db.saveGmJournal(...)` never resolves to
    // `undefined` when a test doesn't care about the saved row's shape.
    vi.mocked(db.saveGmJournal).mockResolvedValue({
      id: 'j1',
      space_id: 'space-1',
      notes: '',
      wonders: [],
      updated_at: 't-saved',
    });
    vi.mocked(subscribeSpace).mockReset();
    vi.mocked(subscribeSpace).mockImplementation(() => () => {});
  });

  // A failed assertion under fake timers must not leak them into later
  // tests (mirrors useTimelineGm.test.tsx's cleanup), so this runs
  // unconditionally rather than as the last line of each test body.
  afterEach(() => vi.useRealTimers());

  it('adds a wonder optimistically and saves the whole array', async () => {
    const { result } = renderHook(() => useGmJournal('space-1'), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addWonder('I wonder about the standing stones'));
    expect(result.current.journal.wonders).toHaveLength(1);
    expect(result.current.journal.wonders[0].resolved).toBe(false);
    await waitFor(() =>
      expect(db.saveGmJournal).toHaveBeenCalledWith('space-1', {
        wonders: [expect.objectContaining({ text: 'I wonder about the standing stones' })],
      }),
    );
  });

  it('debounces notes saves and never sends wonders alongside', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGmJournal('space-1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load
    act(() => result.current.updateNotes('<p>a</p>'));
    act(() => result.current.updateNotes('<p>ab</p>'));
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(db.saveGmJournal).toHaveBeenCalledTimes(1);
    expect(db.saveGmJournal).toHaveBeenCalledWith('space-1', { notes: '<p>ab</p>' });
  });

  it('a wonder added right after typing does not roll back the notes', async () => {
    // Both fields are dirty-tracked independently, but the LOCAL state is a
    // single object — an edit to one field must never clobber a same-tick
    // edit to the other via a stale ref snapshot.
    const { result } = renderHook(() => useGmJournal('space-1'), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.updateNotes('<p>typed</p>');
      result.current.addWonder('w');
    });
    expect(result.current.journal.notes).toBe('<p>typed</p>');
    expect(result.current.journal.wonders).toHaveLength(1);
  });

  it('a realtime refetch keeps locally dirty notes but adopts remote wonders', async () => {
    vi.useFakeTimers();
    let onChange: () => void = () => {};
    vi.mocked(subscribeSpace).mockImplementation((_id, cb) => {
      onChange = cb;
      return () => {};
    });
    const remoteWonder = {
      id: 'w9',
      text: 'remote wondering',
      resolved: false,
      created_at: '2026-07-30T00:00:00Z',
    };
    vi.mocked(db.getGmJournal)
      .mockResolvedValueOnce({
        id: 'j1',
        space_id: 'space-1',
        notes: '<p>old</p>',
        wonders: [],
        updated_at: 't1',
      })
      .mockResolvedValueOnce({
        id: 'j1',
        space_id: 'space-1',
        notes: '<p>remote</p>',
        wonders: [remoteWonder],
        updated_at: 't2',
      });

    const { result } = renderHook(() => useGmJournal('space-1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load
    act(() => result.current.updateNotes('<p>mine</p>')); // dirty, debounce pending
    await act(async () => {
      onChange(); // realtime ping -> refetch resolves the second value
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.journal.notes).toBe('<p>mine</p>'); // local kept
    expect(result.current.journal.wonders).toEqual([remoteWonder]); // remote adopted
  });

  it('keeps a field dirty after a failed save so a later refetch does not overwrite it', async () => {
    vi.useFakeTimers();
    let onChange: () => void = () => {};
    vi.mocked(subscribeSpace).mockImplementation((_id, cb) => {
      onChange = cb;
      return () => {};
    });
    vi.mocked(db.getGmJournal)
      .mockResolvedValueOnce({
        id: 'j1',
        space_id: 'space-1',
        notes: '<p>old</p>',
        wonders: [],
        updated_at: 't1',
      })
      // Refetch triggered AFTER the failed save below: if the failure wrongly
      // cleared the dirty marker, this stale value silently wins.
      .mockResolvedValueOnce({
        id: 'j1',
        space_id: 'space-1',
        notes: '<p>stale remote, never saw my edit</p>',
        wonders: [],
        updated_at: 't2',
      });
    vi.mocked(db.saveGmJournal).mockRejectedValueOnce(new Error('network drop'));

    const { result } = renderHook(() => useGmJournal('space-1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load
    act(() => result.current.updateNotes('<p>mine</p>'));
    await act(() => vi.advanceTimersByTimeAsync(700)); // debounce fires, save rejects
    expect(db.saveGmJournal).toHaveBeenCalledTimes(1);

    await act(async () => {
      onChange(); // realtime ping after the failed save
      await vi.runOnlyPendingTimersAsync();
    });
    // Never persisted — must still be treated as dirty, so the refetch must
    // NOT adopt the remote value in its place.
    expect(result.current.journal.notes).toBe('<p>mine</p>');
  });

  it("keeps a mid-flight edit that starts during a refetch's round trip", async () => {
    vi.useFakeTimers();
    let onChange: () => void = () => {};
    vi.mocked(subscribeSpace).mockImplementation((_id, cb) => {
      onChange = cb;
      return () => {};
    });
    vi.mocked(db.getGmJournal).mockResolvedValueOnce({
      id: 'j1',
      space_id: 'space-1',
      notes: '<p>old</p>',
      wonders: [],
      updated_at: 't1',
    });

    const { result } = renderHook(() => useGmJournal('space-1'), { wrapper });
    await act(() => vi.runOnlyPendingTimersAsync()); // initial load, field clean

    let resolveGet!: (value: GmJournal | null) => void;
    const pending = new Promise<GmJournal | null>((resolve) => {
      resolveGet = resolve;
    });
    vi.mocked(db.getGmJournal).mockReturnValueOnce(pending);

    // Refetch starts while nothing is dirty yet: the "before" snapshot is empty.
    act(() => {
      onChange();
    });
    // Types WHILE the GET above is still in flight — only visible to an
    // "after" snapshot taken once the round trip resolves.
    act(() => result.current.updateNotes('<p>mine mid-flight</p>'));

    await act(async () => {
      resolveGet({
        id: 'j1',
        space_id: 'space-1',
        notes: '<p>remote, unrelated to the mid-flight edit</p>',
        wonders: [],
        updated_at: 't2',
      });
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.journal.notes).toBe('<p>mine mid-flight</p>');
  });
});
