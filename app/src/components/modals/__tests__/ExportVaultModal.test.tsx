import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ExportVaultModal } from '../ExportVaultModal';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { SpaceRole, SpaceSession } from '@/types';

// The menu entry is the first gate; this is the second. A modal that refuses on
// its own means a future entry point cannot reopen the affordance by forgetting
// the role check.

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

function open(role: SpaceRole) {
  useAppStore.setState({ session: sessionAt(role) });
  render(
    <LanguageProvider>
      <ExportVaultModal isOpen onClose={() => {}} />
    </LanguageProvider>,
  );
}

describe('ExportVaultModal', () => {
  it('renders nothing for a viewer', () => {
    open('viewer');
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    expect(screen.queryByText(/Export the grimoire/i)).toBeNull();
  });

  it.each<SpaceRole>(['player', 'gm'])('offers the export to a %s', (role) => {
    open(role);
    expect(screen.getByRole('button', { name: /download/i })).toBeTruthy();
  });
});
