import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { IDBFactory } from 'fake-indexeddb';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { LanguageProvider } from '@/i18n';
import { useTimeline } from '@/hooks/useTimeline';
import { useGmJournal } from '@/hooks/useGmJournal';
import { useSteading } from '@/hooks/useSteading';
import { useLocations } from '@/hooks/useLocations';
import { localDb } from '@/lib/mockDb';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { resetOfflineDbForTests } from '@/lib/offline/idb';
import { pendingSteading } from '@/lib/steading/steading';
import {
  resetConnectivityForTests,
  markNetworkFailure,
  markNetworkSuccess,
} from '@/lib/offline/connectivity';
import { createDefaultSteading } from '@/lib/steading/steadingSeed';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

const settle = () => new Promise((r) => setTimeout(r, 0));

/** Shaped the way Supabase surfaces a transport failure: empty code. */
const netError = () =>
  Object.assign(new Error('TypeError: Failed to fetch'), {
    code: '',
    details: null,
    hint: null,
  });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
  resetConnectivityForTests();
  localStorage.clear();
  sessionStorage.clear();
  pendingSteading.clear();
  useAppStore.setState({ session: null, sessions: {}, locations: [] });
  vi.restoreAllMocks();
});

// The bug this whole feature had to fix first. Before it, a network-class
// autosave failure cleared the `dirty` marker, so the next successful read —
// reconnect, or now cache hydration, which succeeds even while OFFLINE —
// overwrote the session recap with the server's version.
describe('chronicle drafts survive a network failure', () => {
  it('keeps the entry dirty, so reconnecting pushes the local text', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF001', password_hash: 'x' });
    const { result } = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    // Seed a server-side value THROUGH the hook, so its local revision stays
    // in step — seeding behind its back would make the replay below hit a
    // legitimate CAS conflict and prove nothing about the dirty marker.
    act(() => {
      result.current.updateEntry(2, 'spring', { body: '<p>server text</p>' });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(localDb.getTimeline(space.id)?.entries['2']?.spring).toMatchObject({
      body: '<p>server text</p>',
    });

    const saveSpy = vi.spyOn(db, 'saveTimelineEntry').mockRejectedValue(netError());
    act(() => {
      result.current.updateEntry(2, 'spring', { body: '<p>my recap</p>' });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(saveSpy).toHaveBeenCalled();
    saveSpy.mockRestore();
    // The spy stands in for `db.ts`, so the offline marking it would normally
    // do on a transport failure is simulated here.
    act(() => { markNetworkFailure(); });

    // Reconnect. Only a still-dirty entry gets replayed — which is precisely
    // what the old `dirtyRef.delete` on network failure destroyed.
    await act(async () => { markNetworkSuccess(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

    expect(localDb.getTimeline(space.id)?.entries['2']?.spring).toMatchObject({
      body: '<p>my recap</p>',
    });
  });

  it('still clears dirty for an application error, where the server has ruled', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF002', password_hash: 'x' });
    const { result } = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    await db.saveTimelineEntry(space.id, 2, 'spring', { body: '<p>server text</p>' }, 0);
    const saveSpy = vi.spyOn(db, 'saveTimelineEntry').mockRejectedValue(
      Object.assign(new Error('FORBIDDEN'), { code: '42501' }),
    );

    act(() => {
      result.current.updateEntry(2, 'spring', { body: '<p>rejected</p>' });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    saveSpy.mockRestore();
    act(() => { markNetworkFailure(); });

    // Nothing to replay: the server refused on the merits, not the transport.
    await act(async () => { markNetworkSuccess(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

    expect(localDb.getTimeline(space.id)?.entries['2']?.spring).toMatchObject({
      body: '<p>server text</p>',
    });
  });

  it('stashes a dirty entry whose save already failed, and restores it on remount', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF003', password_hash: 'x' });
    const first = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    vi.spyOn(db, 'saveTimelineEntry').mockRejectedValue(netError());
    act(() => {
      first.result.current.updateEntry(3, 'summer', { body: '<p>unsent</p>' });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

    first.unmount();
    await settle();
    expect(sessionStorage.getItem(`inkstone:chronicles:conflicts:${space.id}`)).toContain('unsent');

    vi.restoreAllMocks();
    const second = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(second.result.current.timeline?.entries['3']?.summer).toMatchObject({
      body: '<p>unsent</p>',
    });
    // An unsent draft is not a conflict — no banner to resolve.
    expect(second.result.current.conflictFor(3, 'summer', 'player')).toBeNull();
  });

  it('flushes a still-dirty entry when the connection returns', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF004', password_hash: 'x' });
    const { result } = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    const saveSpy = vi.spyOn(db, 'saveTimelineEntry').mockRejectedValue(netError());
    act(() => {
      result.current.updateEntry(4, 'autumn', { body: '<p>held</p>' });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    saveSpy.mockRestore();
    act(() => { markNetworkFailure(); });

    await act(async () => { markNetworkSuccess(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

    expect(localDb.getTimeline(space.id)?.entries['4']?.autumn).toMatchObject({
      body: '<p>held</p>',
    });
  });
});

describe('GM journal drafts', () => {
  it('flushes a pending note on unmount instead of dropping it', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF005', password_hash: 'x' });
    const { result, unmount } = renderHook(() => useGmJournal(space.id), { wrapper });
    await act(async () => {});

    act(() => {
      result.current.updateNotes('<p>margin note</p>');
    });
    // Unmount INSIDE the 600 ms debounce window.
    unmount();
    await settle();

    expect(localDb.getGmJournal(space.id)?.notes).toBe('<p>margin note</p>');
  });

  it('retries a dirty field when the connection returns', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF006', password_hash: 'x' });
    const { result } = renderHook(() => useGmJournal(space.id), { wrapper });
    await act(async () => {});

    const saveSpy = vi.spyOn(db, 'saveGmJournal').mockRejectedValue(netError());
    act(() => {
      result.current.updateNotes('<p>held note</p>');
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    saveSpy.mockRestore();
    act(() => { markNetworkFailure(); });

    await act(async () => { markNetworkSuccess(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(localDb.getGmJournal(space.id)?.notes).toBe('<p>held note</p>');
  });
});

describe('steading drafts', () => {
  it('flushes a pending sheet edit on unmount instead of dropping it', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF007', password_hash: 'x' });
    const loc = localDb.createLocation({
      space_id: space.id,
      name: 'Stonetop',
      color: '#888',
      steading: createDefaultSteading('en'),
      gm_only: false,
    });
    useAppStore.setState({ locations: [loc] });

    const { result, unmount } = renderHook(
      () => ({ steading: useSteading(space.id), locations: useLocations(space.id) }),
      { wrapper },
    );
    await act(async () => {});

    act(() => {
      result.current.steading.mutateSteading(loc.id, (cur) => ({
        ...cur,
        stats: { ...cur.stats, prosperity: 3 },
      }));
    });
    // Unmount INSIDE the 600 ms debounce window. Before the fix the value
    // survived only in `pendingSteading`, so the sheet LOOKED saved until a
    // reload proved otherwise.
    unmount();
    await settle();

    expect(localDb.getSpaceLocations(space.id)[0].steading?.stats.prosperity).toBe(3);
  });

  // The toast must tell the truth about queued work: a NETWORK failure keeps
  // the edit in `pendingSteading` and the reconnect flush re-sends it, so
  // "check your connection and try again" (steading.saveError) was wrong on
  // both counts. Application errors keep the retry copy.
  it('announces "kept and will go up" for a network failure, not "try again"', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'OFF008', password_hash: 'x' });
    const loc = localDb.createLocation({
      space_id: space.id,
      name: 'Stonetop',
      color: '#888',
      steading: createDefaultSteading('en'),
      gm_only: false,
    });
    useAppStore.setState({ locations: [loc] });
    vi.spyOn(db, 'updateLocation').mockRejectedValue(netError());

    const { result } = renderHook(
      () => ({ steading: useSteading(space.id), locations: useLocations(space.id) }),
      { wrapper },
    );
    await act(async () => {});

    act(() => {
      result.current.steading.mutateSteading(loc.id, (cur) => ({
        ...cur,
        stats: { ...cur.stats, prosperity: 2 },
      }));
    });
    // Fire the debounced flush without waiting 600 ms of wall clock.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });

    const toast = useAppStore.getState().toast;
    expect(toast?.message).toContain('kept here and will go up');
    // The edit itself must still be queued for the reconnect flush.
    expect(pendingSteading.get(loc.id)?.stats.prosperity).toBe(2);
  });
});
