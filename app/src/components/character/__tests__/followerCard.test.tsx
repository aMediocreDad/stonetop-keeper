import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowerCard } from '../FollowerCard';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { FollowerBlock, SpaceRole, SpaceSession } from '@/types';

function makeSession(role: SpaceRole): SpaceSession {
  return {
    space: {
      id: 'space-1',
      name: 'S',
      invite_code: 'xx-xxx',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    isAdmin: role === 'gm',
    token: 't',
    role,
  };
}

const follower = (over: Partial<FollowerBlock> = {}): FollowerBlock =>
  ({ cost: 'recognition', loyalty: 1, leaderId: null, ...over });

function renderCard(
  value = follower(),
  onChange = vi.fn(),
  editable = false,
  leaderOptions: Array<{ id: string; name: string }> = [],
) {
  render(
    <LanguageProvider>
      <FollowerCard
        value={value}
        onChange={onChange}
        editable={editable}
        leaderOptions={leaderOptions}
      />
    </LanguageProvider>,
  );
  return onChange;
}

describe('FollowerCard', () => {
  afterEach(() => useAppStore.setState({ session: null }));

  // La carte se monte sur la seule présence du bloc follower : une fiche sans
  // aucune stat doit pouvoir être un follower (c'est tout l'objet du split).
  it('renders cost and loyalty with no stat block in sight', () => {
    renderCard();
    expect(screen.getByText('recognition')).toBeTruthy();
    expect(screen.getAllByRole('checkbox', { name: /Loyalty/ })).toHaveLength(3);
    expect(screen.queryByText('HP')).toBeNull();
  });

  it('loyalty dots set and unset (click filled dot n → n-1)', () => {
    const onChange = renderCard();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Loyalty 3' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ loyalty: 3 }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Loyalty 1' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ loyalty: 0 }));
  });

  // La loyauté est un acte de jeu : elle fonctionne hors édition, mais reste
  // figée pour un spectateur (le serveur rejette déjà ses écritures).
  it('viewers cannot tick loyalty', () => {
    useAppStore.setState({ session: makeSession('viewer') });
    const onChange = renderCard();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Loyalty 3' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edit mode: leader select maps the party option to null and a named option to its id', () => {
    const onChange = renderCard(follower(), vi.fn(), true, [{ id: 'pj1', name: 'Rhianna' }]);
    fireEvent.change(screen.getByLabelText('Follows'), { target: { value: 'pj1' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ leaderId: 'pj1' }));
    fireEvent.change(screen.getByLabelText('Follows'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ leaderId: null }));
  });

  it('read mode: "The party" with no leader, the leader name when resolved', () => {
    renderCard(follower(), vi.fn(), false, [{ id: 'pj1', name: 'Rhianna' }]);
    expect(screen.getByText(/The party/)).toBeTruthy();
  });

  it('read mode: hides the leash entirely when the leader no longer exists', () => {
    renderCard(follower({ leaderId: 'gone' }), vi.fn(), false, [{ id: 'pj1', name: 'Rhianna' }]);
    expect(screen.queryByText('Follows')).toBeNull();
  });

  it('edit mode: cost is editable', () => {
    const onChange = renderCard(follower({ cost: '' }), vi.fn(), true);
    fireEvent.change(screen.getByLabelText('Cost'), { target: { value: 'a warm bed' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 'a warm bed' }));
  });
});
