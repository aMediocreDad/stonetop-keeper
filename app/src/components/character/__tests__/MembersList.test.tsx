import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

vi.mock('@/hooks/useRole', () => ({
  useCanEdit: () => true,
  useIsGm: () => true,
}));

// Le hook réel touche @/lib/db (client Supabase) au montage via useEffect ;
// on le stubbe pour ne tester que le rendu, comme RelationsList.test.tsx.
vi.mock('@/hooks/useRelations', () => ({
  useRelations: () => ({
    createRelation: vi.fn(),
    deleteRelation: vi.fn(),
  }),
}));

import { MembersList } from '@/components/character/MembersList';
import { LanguageProvider } from '@/i18n';
import type { Character } from '@/types';

const group: Character = {
  id: 'g-1', space_id: 'space-1', name: 'The Wardens', role: '', type: 'GROUPE',
  notes: '', instinct: '', traits: [], tags: [], gm_only: false, dead: false,
  gm_notes: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
};

const npc: Character = {
  ...group, id: 'c-1', name: 'Elios', role: 'farmer, ex-mercenary', type: 'PNJ',
};

const discovery: Character = {
  ...group, id: 'd-1', name: 'The bronze plate', role: 'arcanum', type: 'DISCOVERY',
};

function renderList() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <MembersList groupId={group.id} characters={[group, npc, discovery]} relations={[]} />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

afterEach(() => cleanup());

// This is the SECOND, unfiltered creation path for `membre` relations the
// relationTypesForPair plan never considered: MembersList builds its own
// candidate list rather than routing through that filter, so it can offer a
// discovery as a group member even though the picker in RelationsList
// (relationTypes.test.ts: "offers ... no social ones ... when an end is a
// discovery") never would. A discovery is a thing found, not a member of
// anything.
describe('MembersList — add-member picker', () => {
  it('never offers a discovery as a candidate member, but keeps ordinary characters', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Add a member' }));
    const picker = screen.getByRole('combobox', { name: 'Choose a character…' });
    const offered = [...picker.querySelectorAll('option')]
      .map((o) => o.textContent)
      .filter((text) => text !== 'Choose a character…');
    expect(offered.some((text) => text?.includes('Elios'))).toBe(true);
    expect(offered.some((text) => text?.includes('The bronze plate'))).toBe(false);
  });
});
