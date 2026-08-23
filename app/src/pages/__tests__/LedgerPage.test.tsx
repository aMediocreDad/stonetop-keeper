import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const useRevisions = vi.fn();
vi.mock('@/hooks/useRevisions', () => ({
  useRevisions: (...a: unknown[]) => useRevisions(...a),
}));

const useIsGm = vi.fn();
vi.mock('@/hooks/useRole', () => ({
  useIsGm: () => useIsGm(),
}));

import LedgerPage from '@/pages/LedgerPage';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { en } from '@/i18n/en';
import type { SpaceSession } from '@/types';

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

/** Empty-hook shape by default; individual tests override just what they need. */
const baseRevisions = () => ({
  events: [],
  status: 'ready' as const,
  hasMore: false,
  loadMore: vi.fn(),
  retry: vi.fn(),
  preview: vi.fn(),
  undo: vi.fn(),
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <LedgerPage />
      </LanguageProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  useRevisions.mockReset();
  useIsGm.mockReset();
  useAppStore.setState({ session: null, sessions: {}, characters: [], relations: [], locations: [] });
});

afterEach(() => cleanup());

describe('LedgerPage', () => {
  it('shows the empty state for a GM with an empty ledger — not a crash, not the error state', () => {
    useIsGm.mockReturnValue(true);
    useRevisions.mockReturnValue(baseRevisions());
    useAppStore.setState({ session });

    renderPage();

    expect(screen.getByText(en.ledger.empty)).toBeTruthy();
    expect(screen.queryByText(en.common.loadError)).toBeNull();
    expect(screen.queryByText(en.common.loading)).toBeNull();
  });

  it('shows the loading state while the hook has no events yet', () => {
    useIsGm.mockReturnValue(true);
    useRevisions.mockReturnValue({ ...baseRevisions(), status: 'loading' });
    useAppStore.setState({ session });

    renderPage();

    expect(screen.getByText(en.common.loading)).toBeTruthy();
    expect(screen.queryByText(en.ledger.empty)).toBeNull();
  });

  it('renders nothing of the ledger for a non-GM', () => {
    useIsGm.mockReturnValue(false);
    useRevisions.mockReturnValue(baseRevisions());
    useAppStore.setState({ session: { ...session, role: 'player' } });

    renderPage();

    expect(screen.queryByText(en.ledger.title)).toBeNull();
    expect(screen.queryByText(en.ledger.empty)).toBeNull();
  });
});
