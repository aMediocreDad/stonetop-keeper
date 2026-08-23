import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ConnectLlmModal } from '../ConnectLlmModal';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { SpaceSession } from '@/types';

// Rendered directly: the modal is presentational over `session.token`, and the
// behaviour under test — that the copied command carries this member's own
// token and this instance's origin — lives entirely in its own render logic.

const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

const session: SpaceSession = {
  space: {
    id: 's1',
    name: 'Example Campaign',
    invite_code: 'ab-cde',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  },
  token: 'tok-abc',
  isAdmin: true,
  role: 'gm',
};

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  useAppStore.setState({ session });
});

afterEach(() => cleanup());

function open() {
  render(
    <LanguageProvider>
      <ConnectLlmModal isOpen onClose={() => {}} />
    </LanguageProvider>,
  );
}

describe('ConnectLlmModal', () => {
  it('shows a command carrying this member token and this origin', () => {
    open();
    const command = screen.getByText(/claude mcp add/);
    expect(command.textContent).toContain('tok-abc');
    expect(command.textContent).toContain(`${window.location.origin}/mcp`);
    expect(command.textContent).toContain('Authorization: Bearer');
  });

  it('copies the command to the clipboard', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('tok-abc');
  });

  it('warns that the command is a credential', () => {
    open();
    expect(screen.getByText(/keep it out of shared channels/i)).toBeTruthy();
  });

  // A viewer is a guest, not an operator: the command below carries a live
  // credential, and handing one to a read-only visitor makes the campaign
  // scriptable by anyone who was given the invite code.
  it('renders nothing for a viewer', () => {
    useAppStore.setState({ session: { ...session, isAdmin: false, role: 'viewer' } });
    open();
    expect(screen.queryByText(/claude mcp add/)).toBeNull();
  });
});
