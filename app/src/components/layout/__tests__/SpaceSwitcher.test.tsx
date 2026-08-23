import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { SpaceRole, SpaceSession } from '@/types';
import { SpaceSwitcher } from '../SpaceSwitcher';

// The Connect-LLM entry is behind `isSupabaseConfigured()`, which is false in
// the suite (vitest.config.ts blanks the Supabase vars). Forcing it true is
// what makes the role gate — rather than the env — the thing under test.
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  isSupabaseConfigured: () => true,
}));


function sessionAt(role: SpaceRole): SpaceSession {
  return {
    space: {
      id: 's1',
      name: 'Example Campaign',
      invite_code: 'ab-cde',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    },
    token: 'tok-abc',
    isAdmin: role === 'gm',
    role,
  };
}

beforeEach(() => {
  useAppStore.setState({ characters: [], locations: [] });
});

afterEach(() => cleanup());

function openMenu(role: SpaceRole) {
  const session = sessionAt(role);
  useAppStore.setState({ session, sessions: { s1: session } });
  render(
    <LanguageProvider>
      <MemoryRouter>
        <SpaceSwitcher />
      </MemoryRouter>
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Example Campaign/i }));
}

describe('SpaceSwitcher menu', () => {
  it('offers a viewer neither the export nor the MCP connection', () => {
    openMenu('viewer');
    expect(screen.queryByText(/connect/i)).toBeNull();
    expect(screen.queryByText(/export/i)).toBeNull();
  });

  it.each<SpaceRole>(['player', 'gm'])('offers both to a %s', (role) => {
    openMenu(role);
    expect(screen.getByText(/connect/i)).toBeTruthy();
    expect(screen.getByText(/export/i)).toBeTruthy();
  });
});
