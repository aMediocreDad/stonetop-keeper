import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { LanguageProvider } from '@/i18n';
import { useTimeline } from '@/hooks/useTimeline';
import { localDb } from '@/lib/mockDb';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

const settle = () => new Promise((r) => setTimeout(r, 0));

/** Fait tirer le debounce (600 ms) sous fake timers, puis laisse la sauvegarde se poser. */
const fireDebounce = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
};

describe('useTimeline conflicts', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seedStaleHook = async (code: string) => {
    const space = localDb.createSpace({ name: 'S', invite_code: code, password_hash: 'x' });
    localDb.saveTimelineEntry(space.id, 2, 'spring', { body: '<p>original</p>' }, 0); // rev 1
    const hook = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {}); // fetch initial : le hook connaît rev 1
    // Un AUTRE client écrit par-dessus : rev 2. Le hook ne refetch pas (pas
    // d'évènement broadcast en mock avant le poll 1 s).
    localDb.saveTimelineEntry(space.id, 2, 'spring', { body: '<p>theirs</p>' }, 1);
    return { space, hook };
  };

  it('surfaces a conflict instead of overwriting, and keeps the local text', async () => {
    const { space, hook } = await seedStaleHook('CNF401');
    vi.useFakeTimers();
    act(() => {
      hook.result.current.updateEntry(2, 'spring', { body: '<p>mine</p>' });
    });
    await fireDebounce();

    const conflict = hook.result.current.conflictFor(2, 'spring', 'player');
    expect(conflict).toMatchObject({ body: '<p>theirs</p>', rev: 2 });
    // Le texte local n'a pas bougé, la base non plus.
    expect(hook.result.current.timeline.entries['2'].spring).toMatchObject({ body: '<p>mine</p>' });
    expect(localDb.getTimeline(space.id)?.entries['2'].spring).toMatchObject({ body: '<p>theirs</p>', rev: 2 });
    hook.unmount();
  });

  it('resolve "theirs" adopts the remote text and clears the conflict', async () => {
    const { hook } = await seedStaleHook('CNF402');
    vi.useFakeTimers();
    act(() => {
      hook.result.current.updateEntry(2, 'spring', { body: '<p>mine</p>' });
    });
    await fireDebounce();

    act(() => {
      hook.result.current.resolveConflict(2, 'spring', 'player', 'theirs');
    });
    expect(hook.result.current.conflictFor(2, 'spring', 'player')).toBeNull();
    expect(hook.result.current.timeline.entries['2'].spring).toMatchObject({
      body: '<p>theirs</p>',
      rev: 2,
    });
    hook.unmount();
  });

  it('resolve "mine" re-saves over the seen revision', async () => {
    const { space, hook } = await seedStaleHook('CNF403');
    vi.useFakeTimers();
    act(() => {
      hook.result.current.updateEntry(2, 'spring', { body: '<p>mine</p>' });
    });
    await fireDebounce();

    await act(async () => {
      hook.result.current.resolveConflict(2, 'spring', 'player', 'mine');
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(hook.result.current.conflictFor(2, 'spring', 'player')).toBeNull();
    expect(localDb.getTimeline(space.id)?.entries['2'].spring).toMatchObject({
      body: '<p>mine</p>',
      rev: 3,
    });
    hook.unmount();
  });

  it('a conflict during the unmount flush is stashed and restored on remount', async () => {
    const { space, hook } = await seedStaleHook('CNF404');
    act(() => {
      hook.result.current.updateEntry(2, 'spring', { body: '<p>mine</p>' });
    });
    hook.unmount(); // flush immédiat → CONFLICT hors montage → stash
    await settle();

    const remounted = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});
    expect(remounted.result.current.conflictFor(2, 'spring', 'player')).toMatchObject({
      body: '<p>theirs</p>',
      rev: 2,
    });
    // Le texte du partant est restauré localement, pas perdu.
    expect(remounted.result.current.timeline.entries['2'].spring).toMatchObject({ body: '<p>mine</p>' });
    remounted.unmount();
  });

  it('an OPEN conflict is stashed on unmount and restored on remount', async () => {
    const { space, hook } = await seedStaleHook('CNF406');
    vi.useFakeTimers();
    act(() => {
      hook.result.current.updateEntry(2, 'spring', { body: '<p>mine</p>' });
    });
    await fireDebounce();
    expect(hook.result.current.conflictFor(2, 'spring', 'player')).not.toBeNull();
    vi.useRealTimers();

    // Pas de flusher pour une entrée en conflit (autosave en pause) : le
    // démontage doit mettre le texte de côté lui-même, pas via le flush.
    hook.unmount();
    await settle();

    const remounted = renderHook(() => useTimeline(space.id), { wrapper });
    await act(async () => {});
    expect(remounted.result.current.conflictFor(2, 'spring', 'player')).toMatchObject({
      body: '<p>theirs</p>',
      rev: 2,
    });
    expect(remounted.result.current.timeline.entries['2'].spring).toMatchObject({
      body: '<p>mine</p>',
    });
    remounted.unmount();
  });

  it('typing immediately after resolving persists the new text', async () => {
    const { space, hook } = await seedStaleHook('CNF405');
    vi.useFakeTimers();
    act(() => {
      hook.result.current.updateEntry(2, 'spring', { body: '<p>mine</p>' });
    });
    await fireDebounce();

    // MÊME act() pour les deux appels : une frontière act() flusherait les
    // effets et masquerait la fenêtre de staleness que ce test verrouille
    // (la porte de conflit doit être synchrone, pas resynchronisée par effet).
    act(() => {
      hook.result.current.resolveConflict(2, 'spring', 'player', 'theirs');
      hook.result.current.updateEntry(2, 'spring', { body: '<p>after</p>' });
    });
    await fireDebounce();

    expect(hook.result.current.conflictFor(2, 'spring', 'player')).toBeNull();
    expect(localDb.getTimeline(space.id)?.entries['2'].spring).toMatchObject({
      body: '<p>after</p>',
      rev: 3,
    });
    hook.unmount();
  });
});
