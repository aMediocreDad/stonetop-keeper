import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// `.env.local` fournit de vraies creds Supabase (nécessaires à `npm run dev`),
// mais Vitest les charge aussi : sans ce stub, `db.ts` ciblerait le vrai
// Supabase au lieu du seam `localDb` attendu par ce test.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { LanguageProvider } from '@/i18n';
import { useTimeline, mergeRemote } from '@/hooks/useTimeline';
import { localDb } from '@/lib/mockDb';
import type { Timeline } from '@/types';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

/** Laisse la sauvegarde asynchrone (flush) se poser. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('useTimeline', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('flushes a pending debounced save on unmount', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'TLN311', password_hash: 'x' });
    const { result, unmount } = renderHook(() => useTimeline(space.id), { wrapper });
    // attend le fetch initial
    await act(async () => {});

    act(() => {
      result.current.updateEntry(2, 'spring', { body: '<p>ambush at the ford</p>' });
    });

    // Démontage AVANT l'échéance du debounce (600 ms) : la saisie doit
    // quand même être persistée.
    unmount();
    await settle();

    const saved = localDb.getTimeline(space.id);
    expect(saved?.entries['2']?.spring).toMatchObject({ body: '<p>ambush at the ford</p>' });
    expect(saved?.current_year).toBe(2);
    expect(saved?.current_season).toBe('spring');
  });

  it('does not save on unmount when nothing is pending', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'TLN312', password_hash: 'x' });
    const { unmount } = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    unmount();
    await settle();

    expect(localDb.getTimeline(space.id)).toBeNull();
  });

  it('concurrent edits to DIFFERENT seasons both survive (no blob clobbering)', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'TLN313', password_hash: 'x' });
    // Deux clients : deux instances du hook sur le même space.
    const a = renderHook(() => useTimeline(space.id), { wrapper });
    const b = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    // Chacun édite SA saison, sans refetch entre les deux (états croisés périmés).
    act(() => {
      a.result.current.updateEntry(2, 'spring', { body: '<p>ambush</p>' });
    });
    act(() => {
      b.result.current.updateEntry(3, 'winter', { body: '<p>siege</p>' });
    });

    // Les deux flushs partent au démontage — l'ordre ne doit plus compter.
    a.unmount();
    b.unmount();
    await settle();

    const saved = localDb.getTimeline(space.id);
    expect(saved?.entries['2']?.spring).toMatchObject({ body: '<p>ambush</p>' });
    expect(saved?.entries['3']?.winter).toMatchObject({ body: '<p>siege</p>' });
    expect(saved?.current_year).toBe(3);
    expect(saved?.current_season).toBe('winter');
  });

  it('moves an entry through the server and refuses an occupied target', async () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'TLN314', password_hash: 'x' });
    localDb.saveTimelineEntry(space.id, 2, 'spring', { body: '<p>ambush</p>' }, 0);
    localDb.saveTimelineEntry(space.id, 5, 'autumn', { body: '<p>busy</p>' }, 0);
    const { result, unmount } = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});

    let refused = true;
    act(() => {
      refused = result.current.moveEntry({ year: 2, season: 'spring' }, { year: 5, season: 'autumn' });
    });
    expect(refused).toBe(false); // pré-check client (cible occupée)

    let ok = false;
    act(() => {
      ok = result.current.moveEntry({ year: 2, season: 'spring' }, { year: 7, season: 'summer' });
    });
    expect(ok).toBe(true);
    await act(async () => {
      await settle();
    });

    const saved = localDb.getTimeline(space.id);
    expect(saved?.entries['2']?.spring).toBeUndefined();
    expect(saved?.entries['7']?.summer).toMatchObject({ body: '<p>ambush</p>' });
    unmount();
  });
});

describe('mergeRemote', () => {
  const base: Timeline = {
    id: 'tl-remote',
    space_id: 'space-1',
    entries: { '2': { spring: { body: 'remote spring', rev: 2 } } },
    current_year: 2,
    current_season: 'spring',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('returns base unchanged when nothing is dirty', () => {
    const cur: Timeline = { ...base, id: 'tl-local' };
    const merged = mergeRemote(cur, base, new Map());
    expect(merged).toBe(base);
  });

  it('returns base when cur is null', () => {
    const merged = mergeRemote(null, base, new Map([['player:2:spring', 1]]));
    expect(merged).toBe(base);
  });

  it('keeps the local value for a dirty player entry, remote for the rest, and local marker', () => {
    const cur: Timeline = {
      id: 'tl-local',
      space_id: 'space-1',
      entries: {
        '2': { spring: { body: 'local spring in flight', rev: 2 } },
        '5': { autumn: { body: 'local stale, ignored', rev: 0 } },
      },
      current_year: 2,
      current_season: 'spring',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const remoteBase: Timeline = {
      id: 'tl-remote',
      space_id: 'space-1',
      entries: {
        '2': { spring: { body: 'remote spring, stale', rev: 1 } },
        '5': { autumn: { body: 'remote autumn', rev: 3 } },
      },
      current_year: 5,
      current_season: 'autumn',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    const dirty = new Map([['player:2:spring', 1]]);
    const merged = mergeRemote(cur, remoteBase, dirty);

    // Dirty entry keeps the LOCAL value.
    expect(merged.entries['2']?.spring).toMatchObject({ body: 'local spring in flight' });
    // Non-dirty entry takes the REMOTE value.
    expect(merged.entries['5']?.autumn).toMatchObject({ body: 'remote autumn' });
    // A player entry is dirty: the marker stays LOCAL.
    expect(merged.current_year).toBe(2);
    expect(merged.current_season).toBe('spring');
  });

  it('keeps only the GM entry local when just a GM key is dirty; player entries and marker follow remote', () => {
    const cur: Timeline = {
      id: 'tl-local',
      space_id: 'space-1',
      entries: { '2': { spring: { body: 'local player, stale', rev: 0 } } },
      gm_entries: { '3': { winter: { body: 'local gm in flight', rev: 1 } } },
      current_year: 2,
      current_season: 'spring',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const remoteBase: Timeline = {
      id: 'tl-remote',
      space_id: 'space-1',
      entries: { '2': { spring: { body: 'remote player', rev: 2 } } },
      gm_entries: { '3': { winter: { body: 'remote gm, stale', rev: 0 } } },
      current_year: 5,
      current_season: 'autumn',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    const dirty = new Map([['gm:3:winter', 1]]);
    const merged = mergeRemote(cur, remoteBase, dirty);

    // Dirty GM entry keeps the LOCAL value.
    expect(merged.gm_entries?.['3']?.winter).toMatchObject({ body: 'local gm in flight' });
    // Player entries follow REMOTE (nothing player-side is dirty).
    expect(merged.entries['2']?.spring).toMatchObject({ body: 'remote player' });
    // No player entry dirty: the marker follows REMOTE.
    expect(merged.current_year).toBe(5);
    expect(merged.current_season).toBe('autumn');
  });
});
