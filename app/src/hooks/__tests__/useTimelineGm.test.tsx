import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// `.env.local` fournit de vraies creds Supabase (nécessaires à `npm run dev`),
// mais Vitest les charge aussi : sans ce stub, `db.ts` ciblerait le vrai
// Supabase au lieu du seam `localDb` attendu par ce test.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { LanguageProvider } from '@/i18n';
import { useTimeline } from '@/hooks/useTimeline';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useTimeline — GM strand', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ session: null });
  });
  afterEach(() => vi.useRealTimers());

  it('updateGmEntry saves through a separate strand, hidden from players', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });

    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTimeline(gm.space.id), { wrapper });
    // attend le fetch initial
    await act(async () => {});

    act(() => {
      result.current.updateGmEntry(1, 'spring', { body: 'secret' });
    });

    // laisse la sauvegarde débouncée se poser
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    const saved = await db.getTimeline(gm.space.id);
    expect(saved?.gm_entries?.['1']?.spring).toMatchObject({ body: 'secret' });
    expect(saved?.entries).toEqual({});

    unmount();
    vi.useRealTimers();

    // Rejoint le même grimoire côté joueur : le strand MJ ne doit jamais
    // apparaître dans le timeline exposé par le hook.
    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });

    const { result: playerResult } = renderHook(() => useTimeline(gm.space.id), { wrapper });
    await act(async () => {});

    expect(playerResult.current.timeline.gm_entries ?? null).toBeNull();
  });

  it('flushes a pending debounced GM save on unmount', async () => {
    const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
    useAppStore.setState({ session: gm });

    const { result, unmount } = renderHook(() => useTimeline(gm.space.id), { wrapper });
    await act(async () => {});

    act(() => {
      result.current.updateGmEntry(3, 'autumn', { body: 'secret plot' });
    });

    // Démontage AVANT l'échéance du debounce (600 ms) : la saisie MJ doit
    // quand même être persistée, comme pour le strand joueur.
    unmount();
    await new Promise((r) => setTimeout(r, 0));

    const saved = await db.getTimeline(gm.space.id);
    expect(saved?.gm_entries?.['3']?.autumn).toMatchObject({ body: 'secret plot' });
  });
});
