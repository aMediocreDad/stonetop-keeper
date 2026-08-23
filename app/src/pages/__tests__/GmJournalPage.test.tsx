import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const useGmJournal = vi.fn();
vi.mock('@/hooks/useGmJournal', () => ({
  useGmJournal: (...a: unknown[]) => useGmJournal(...a),
}));

const useIsGm = vi.fn();
vi.mock('@/hooks/useRole', () => ({
  useIsGm: () => useIsGm(),
}));

vi.mock('@/hooks/useCharacters', () => ({
  useCharacters: () => ({ characters: [] }),
}));
vi.mock('@/hooks/useLocations', () => ({
  useLocations: () => ({ locations: [] }),
}));

// Scoped to the wonders list: TipTap/ProseMirror (mounted by the real
// GmNotesCard) has no render-test precedent in this suite and isn't what
// this regression is about, so it's stubbed out rather than exercised.
vi.mock('@/components/shared/GmNotesCard', () => ({
  GmNotesCard: () => null,
}));

import GmJournalPage from '@/pages/GmJournalPage';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { SpaceSession, Wonder } from '@/types';

const session: SpaceSession = {
  space: {
    id: 'space-1',
    name: 'Example Campaign',
    invite_code: 'ABC123',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  },
  isAdmin: true,
  token: 'tok',
  role: 'gm',
};

const baseWonder: Wonder = {
  id: 'w-1',
  text: 'Who burned the mill?',
  resolved: true,
  resolution: 'old note',
  created_at: '2026-07-01T00:00:00Z',
};

const hookReturn = (wonders: Wonder[]) => ({
  journal: { id: 'j-1', space_id: 'space-1', notes: '', wonders, updated_at: '' },
  loaded: true,
  updateNotes: vi.fn(),
  addWonder: vi.fn(),
  toggleWonder: vi.fn(),
  setResolution: vi.fn(),
  deleteWonder: vi.fn(),
});

const tree = () => (
  <MemoryRouter>
    <LanguageProvider>
      <GmJournalPage />
    </LanguageProvider>
  </MemoryRouter>
);

beforeEach(() => {
  useGmJournal.mockReset();
  useIsGm.mockReset();
  // Les deux replis sont retenus par navigateur : sans ce nettoyage, un test
  // hériterait de l'état laissé par le précédent.
  localStorage.clear();
  useAppStore.setState({ session: null, sessions: {}, characters: [], relations: [], locations: [] });
});

/** Déplie « Answered », fermé par défaut. Ancré : « Mark as answered » (la
 *  bascule d'une ligne) contient le même mot. */
const openAnswered = () =>
  fireEvent.click(screen.getByRole('button', { name: /^answered \(\d+\)$/i }));

afterEach(() => cleanup());

describe('GmJournalPage — WonderRow resolution note', () => {
  it('reseeds the note input from the freshest wonder.resolution every time edit mode opens (not just at mount)', () => {
    useIsGm.mockReturnValue(true);
    useAppStore.setState({ session });
    useGmJournal.mockReturnValue(hookReturn([baseWonder]));

    const { rerender } = render(tree());
    openAnswered();

    // Open the inline editor once: shows the mount-time value.
    fireEvent.click(screen.getByText('old note'));
    expect(
      (screen.getByPlaceholderText(/how it turned out/i) as HTMLInputElement).value,
    ).toBe('old note');

    // Close without saving (e.g. tapping away on a phone).
    fireEvent.blur(screen.getByPlaceholderText(/how it turned out/i));

    // A realtime refetch delivers a newer resolution written from a second
    // tab/phone. WonderRow keeps the same key ('w-1') and stays mounted —
    // only the `wonder` prop it receives changes.
    useGmJournal.mockReturnValue(
      hookReturn([{ ...baseWonder, resolution: 'new note from the other tab' }]),
    );
    rerender(tree());

    // Re-opening edit mode must show the fresher value pulled from the
    // second tab, not a stale copy captured once at WonderRow's mount.
    fireEvent.click(screen.getByText('new note from the other tab'));
    expect(
      (screen.getByPlaceholderText(/how it turned out/i) as HTMLInputElement).value,
    ).toBe('new note from the other tab');
  });
});

describe('GmJournalPage — collapsible sections', () => {
  const openWonder: Wonder = {
    id: 'w-open',
    text: 'What lies below the well?',
    resolved: false,
    created_at: '2026-07-01T00:00:00Z',
  };

  beforeEach(() => {
    useIsGm.mockReturnValue(true);
    useAppStore.setState({ session });
    useGmJournal.mockReturnValue(hookReturn([openWonder, baseWonder]));
  });

  it('hides answered wonders behind a disclosure that is closed by default', () => {
    render(tree());

    // The live question reads immediately; the answered one does not.
    expect(screen.getByText(openWonder.text)).toBeTruthy();
    expect(screen.queryByText(baseWonder.text)).toBeNull();

    // The count stays visible while collapsed — that is what makes the
    // closed state informative rather than a hidden pile.
    const toggle = screen.getByRole('button', { name: /answered \(1\)/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(screen.getByText(baseWonder.text)).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses the open-questions list, and the choice survives a remount', () => {
    const { unmount } = render(tree());

    const toggle = screen.getByRole('button', { name: /i wonder.*\(1\)/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);

    // Collapsed: the list and the add form both go, the count stays.
    expect(screen.queryByText(openWonder.text)).toBeNull();
    expect(screen.queryByLabelText(/add an open question/i)).toBeNull();
    expect(screen.getByRole('button', { name: /i wonder.*\(1\)/i })).toBeTruthy();

    // Coming back to the page keeps it folded — the point of persisting is
    // that a GM who folded it once does not re-fold it every visit.
    unmount();
    render(tree());
    expect(
      screen.getByRole('button', { name: /i wonder.*\(1\)/i }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(screen.queryByText(openWonder.text)).toBeNull();
  });
});
