import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

vi.mock('@/hooks/useRole', () => ({ useCanEdit: () => true, useIsGm: () => true }));

const updateRelation = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/hooks/useRelations', () => ({
  useRelations: () => ({
    createRelation: vi.fn(),
    updateRelation,
    deleteRelation: vi.fn(),
  }),
}));

import { RelationsList } from '@/components/character/RelationsList';
import { LanguageProvider } from '@/i18n';
import type { Character, Relation } from '@/types';

const charA: Character = {
  id: 'c-1', space_id: 'space-1', name: 'Rhianna', role: 'Blessed · Initiate',
  type: 'PJ', notes: '', instinct: '', traits: [], tags: [], gm_only: false,
  dead: false, gm_notes: null, created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};
const charB: Character = { ...charA, id: 'c-2', name: 'Elios', type: 'PNJ' };

const relation: Relation = {
  id: 'r-1', space_id: 'space-1', from_character_id: 'c-1', to_character_id: 'c-2',
  relation_type: 'ami', relation_detail: 'owes her a debt', gm_only: false,
  created_at: '2026-07-01T00:00:00Z',
};

function renderList(rel: Relation = relation) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <RelationsList characterId={charA.id} characters={[charA, charB]} relations={[rel]} />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit bond' }));
}

afterEach(() => cleanup());
beforeEach(() => updateRelation.mockClear());

/**
 * Same contract as the character sheet: a bond edit writes only the columns it
 * changed, so the GM flipping `gm_only` and a player rewording the detail stop
 * overwriting each other.
 */
describe('RelationsList — partial saves', () => {
  it('sends only the detail when only the detail changed', async () => {
    renderList();
    openEditor();
    fireEvent.change(screen.getByLabelText('Bond detail'), { target: { value: 'saved her life' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(updateRelation).toHaveBeenCalled());
    const sent = updateRelation.mock.calls[0][1];
    expect(sent.relation_detail).toBe('saved her life');
    expect(Object.keys(sent)).not.toContain('relation_type');
    expect(Object.keys(sent)).not.toContain('gm_only');
  });

  it('sends an explicit null when the detail is cleared', async () => {
    renderList();
    openEditor();
    fireEvent.change(screen.getByLabelText('Bond detail'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(updateRelation).toHaveBeenCalled());
    const sent = updateRelation.mock.calls[0][1];
    // `|| undefined` used to drop the key entirely, and the RPC writes a column
    // only when the key is present — so clearing a detail saved silently and
    // came back on the next resync. Same trap as the location picker.
    expect('relation_detail' in sent).toBe(true);
    expect(sent.relation_detail).toBeNull();
  });

  it('does not call the RPC when nothing changed', async () => {
    renderList();
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(screen.queryByLabelText('Bond detail')).toBeNull());
    expect(updateRelation).not.toHaveBeenCalled();
  });
});
