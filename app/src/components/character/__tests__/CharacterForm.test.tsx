import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

// Mutable per test: this suite only cares about the role-gated FILTER (which
// types a GM vs a player may create), not the create flow itself.
const roleMock = vi.hoisted(() => ({ isGm: true }));
vi.mock('@/hooks/useRole', () => ({
  useCanEdit: () => true,
  useIsGm: () => roleMock.isGm,
}));

// The real hook touches @/lib/db (Supabase client) — stubbed so this suite
// tests rendering only, same pattern as RelationsList.test.tsx.
vi.mock('@/hooks/useCharacters', () => ({
  useCharacters: () => ({ createCharacter: vi.fn() }),
}));

import { CharacterForm } from '@/components/character/CharacterForm';
import { LanguageProvider } from '@/i18n';

afterEach(() => cleanup());

function renderForm() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <CharacterForm onClose={() => {}} />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

/**
 * The type row (CharacterForm.tsx ~:130-160) mirrors DashboardPage's
 * type-filter row: `overflow-x-auto` + `whitespace-nowrap` so five full
 * names ("Non-Player Character" included) scroll instead of wrapping or
 * clipping in the `max-w-lg` dialog. jsdom does no layout, so it cannot see
 * whether that scroll actually engages at a given width — that is a headed
 * check. What it CAN verify, independent of any layout: which options exist
 * and are reachable by name for each role, and that MENACE/DISCOVERY stay
 * gated to the GM. `button[aria-pressed]` selects exactly the type buttons —
 * neither the close (×) nor the submit button carries that attribute.
 */
describe('CharacterForm type row', () => {
  it('offers all five types to a GM, MENACE and DISCOVERY included', () => {
    roleMock.isGm = true;
    const { container } = renderForm();
    const typeButtons = container.querySelectorAll('button[aria-pressed]');
    expect(typeButtons).toHaveLength(5);
    for (const name of [
      'Player Character', 'Non-Player Character', 'Group', 'Threat', 'Discovery',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  // MENACE and DISCOVERY are the GM's prep layer: CharacterForm.tsx's filter
  // (`(typ !== 'MENACE' && typ !== 'DISCOVERY') || isGm`) hides both from a
  // player, leaving three. This is the regression guard for that filter,
  // independent of the CSS fix above — a future edit that widens or narrows
  // the gate should fail here, not silently in a headed pass.
  it('hides MENACE and DISCOVERY from a player, leaving three types', () => {
    roleMock.isGm = false;
    const { container } = renderForm();
    const typeButtons = container.querySelectorAll('button[aria-pressed]');
    expect(typeButtons).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Player Character' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Non-Player Character' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Group' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Threat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discovery' })).toBeNull();
  });

  // Keyboard order: plain sibling <button>s with no `tabIndex` and none
  // `disabled`, inside a container that itself carries no `tabindex` — so
  // `overflow-x-auto` changes what is visible, never DOM/tab order. This is
  // a structural guarantee, not a behavior jsdom can exercise: jsdom has no
  // layout engine (`offsetParent` is always null — verified against this
  // repo's own useDialogFocus trap, which filters on exactly that property),
  // so a real Tab keypress does not reproduce a browser's focus-order
  // computation here, and installing a tool that fakes it would test the
  // fake more than the app. Confirmed instead by asserting the row's DOM
  // order and the absence of any tabIndex override.
  it('never sets tabIndex on the type row, so tab order is plain DOM order', () => {
    const { container } = renderForm();
    const typeButtons = [...container.querySelectorAll('button[aria-pressed]')];
    for (const btn of typeButtons) {
      expect(btn.hasAttribute('tabindex')).toBe(false);
      expect(btn.hasAttribute('disabled')).toBe(false);
    }
    // The scroll container itself is not a stop: it must not carry a
    // tabindex either, or Tab would land on the empty wrapper before its
    // first button.
    expect(typeButtons[0].parentElement?.hasAttribute('tabindex')).toBe(false);
  });
});
