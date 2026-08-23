import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatBlockCard } from '../StatBlockCard';
import { emptyStatBlock } from '@/lib/character/statblock';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { SpaceRole, SpaceSession, StatBlock } from '@/types';

/** Session minimale pour piloter `useRole()` (même approche que threatSheet.test.tsx). */
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

const statted = (): StatBlock => ({
  ...emptyStatBlock(),
  hp: 6,
  damage: 'hatchet d6 (hand)',
  moves: ['Speak with birds'],
});

function renderCard(
  value = statted(),
  onChange = vi.fn(),
  editable = false,
  isFollower = false,
) {
  render(
    <LanguageProvider>
      <StatBlockCard
        value={value}
        onChange={onChange}
        editable={editable}
        isFollower={isFollower}
      />
    </LanguageProvider>,
  );
  return onChange;
}

describe('StatBlockCard', () => {
  afterEach(() => useAppStore.setState({ session: null }));

  it('renders the book line: HP, armor, damage, moves', () => {
    renderCard();
    // Portée à la ligne HP : un `getByText('6')` nu casserait dès qu'une autre
    // stat de la fiche vaut 6 (armure…), avec un message opaque.
    expect(screen.getByText('HP').parentElement?.textContent).toContain('6');
    expect(screen.getByText('hatchet d6 (hand)')).toBeTruthy();
    expect(screen.getByText('Speak with birds')).toBeTruthy();
  });

  // Les PV sont une valeur de fiche, pas un compteur de séance : la table ne
  // les suit pas entre les séances, donc aucun pas-à-pas ne doit revenir.
  it('offers no HP stepper — HP is a sheet value, not a session counter', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /HP/i })).toBeNull();
  });

  it('edit mode: add move', () => {
    const onChange = renderCard({ ...emptyStatBlock() }, vi.fn(), true);
    const moveInput = screen.getByLabelText('Add move');
    fireEvent.change(moveInput, { target: { value: 'Wander off' } });
    fireEvent.keyDown(moveInput, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ moves: ['Wander off'] }));
  });

  // Cette carte ne porte QUE des stats : les classifications de fiche vivent
  // sur la carte Informations, la couche follower sur FollowerCard.
  it('carries no bestiary select, follower toggle or loyalty track', () => {
    renderCard(emptyStatBlock(), vi.fn(), true);
    expect(screen.queryByLabelText('Icon')).toBeNull();
    expect(screen.queryByLabelText('Type')).toBeNull();
    expect(screen.queryByRole('button', { name: /follower/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Loyalty/ })).toBeNull();
    expect(screen.queryByLabelText('Follows')).toBeNull();
  });

  it('edit mode: editing hp, armor, armorNote, damage and special quality fields', () => {
    const onChange = vi.fn();
    renderCard(statted(), onChange, true);

    fireEvent.change(screen.getByLabelText('HP'), { target: { value: '8' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hp: 8 }));

    fireEvent.change(screen.getByLabelText('Armor'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ armor: 2 }));

    fireEvent.change(screen.getByLabelText('Armor note'), { target: { value: 'thick hide' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ armorNote: 'thick hide' }));

    fireEvent.change(screen.getByLabelText('Damage'), { target: { value: 'claws d8' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ damage: 'claws d8' }));

    fireEvent.change(screen.getByLabelText('Special quality'), { target: { value: 'Sees in the dark' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ specialQualities: 'Sees in the dark' }),
    );
  });

  // Un bloc non-follower n'est renvoyé qu'au MJ (supabase-statblock.sql) :
  // rien ne le disait à l'écran, d'où la pastille — et elle doit s'effacer
  // dès que la fiche est un follower, sinon elle mentirait aux joueurs.
  it('flags a non-follower block as GM-only, and drops the flag for a follower', () => {
    useAppStore.setState({ session: makeSession('gm') });
    renderCard(emptyStatBlock(), vi.fn(), false, false);
    expect(screen.getByText('GM')).toBeTruthy();

    cleanup();
    useAppStore.setState({ session: makeSession('gm') });
    renderCard(emptyStatBlock(), vi.fn(), false, true);
    expect(screen.queryByText('GM')).toBeNull();
  });

  it('read mode hides empty optional sections and shows them once populated', () => {
    renderCard(emptyStatBlock(), vi.fn(), false);
    expect(screen.queryByText('Damage')).toBeNull();
    expect(screen.queryByText('Special quality')).toBeNull();
    expect(screen.queryByText('Moves')).toBeNull();

    renderCard({ ...emptyStatBlock(), damage: 'bite d6' }, vi.fn(), false);
    expect(screen.getByText('bite d6')).toBeTruthy();
  });

  it('edit mode: moves can be removed', () => {
    const onChange = vi.fn();
    renderCard(statted(), onChange, true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Speak with birds' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ moves: [] }));
  });

  // L'existence du bloc appartient aux cases Monstre/Follower de la carte
  // Informations : cette carte n'offre plus de « retirer », sinon deux
  // propriétaires pouvaient se contredire à l'écran.
  it('offers no remove button — the Monster/Follower boxes own its existence', () => {
    renderCard(statted(), vi.fn(), true);
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });
});
