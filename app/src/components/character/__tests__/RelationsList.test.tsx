import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

// MJ non-éditeur (spectateur/joueur) : voit le badge, pas les actions
// d'édition — le badge ne doit pas dépendre de canEdit. Mutable pour les cas
// du sélecteur, qui ont besoin du formulaire d'ajout.
const roleMock = vi.hoisted(() => ({ canEdit: false }));
vi.mock('@/hooks/useRole', () => ({
  useCanEdit: () => roleMock.canEdit,
  useIsGm: () => true,
}));

// Le hook réel touche @/lib/db (client Supabase) au montage via useEffect ;
// on le stubbe pour ne tester que le rendu, comme CharacterSheetPage.test.tsx.
vi.mock('@/hooks/useRelations', () => ({
  useRelations: () => ({
    createRelation: vi.fn(),
    updateRelation: vi.fn(),
    deleteRelation: vi.fn(),
  }),
}));

import { RelationsList } from '@/components/character/RelationsList';
import { LanguageProvider } from '@/i18n';
import type { Character, Relation } from '@/types';

const charA: Character = {
  id: 'c-1',
  space_id: 'space-1',
  name: 'Rhianna',
  role: 'Blessed · Initiate',
  type: 'PJ',
  notes: '',
  instinct: '',
  traits: [],
  tags: [],
  gm_only: false,
  dead: false,
  gm_notes: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const charB: Character = {
  ...charA,
  id: 'c-2',
  name: 'Elios',
  role: 'farmer, ex-mercenary',
  type: 'PNJ',
};

const charD: Character = {
  ...charB, id: 'd-1', name: 'Footprints in the mud', type: 'DISCOVERY', role: 'clue',
};

const gmOnlyRelation: Relation = {
  id: 'r-1',
  space_id: 'space-1',
  from_character_id: 'c-1',
  to_character_id: 'c-2',
  relation_type: 'ami',
  gm_only: true,
  created_at: '2026-07-01T00:00:00Z',
};

function renderList(over?: {
  characterId?: string;
  characters?: Character[];
  relations?: Relation[];
}) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <RelationsList
          characterId={over?.characterId ?? charA.id}
          characters={over?.characters ?? [charA, charB]}
          relations={over?.relations ?? [gmOnlyRelation]}
        />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

afterEach(() => {
  cleanup();
  roleMock.canEdit = false;
});

describe('RelationsList — GM badge placement', () => {
  it('renders the GM badge inside the relation button, not floating over its edge', () => {
    renderList();
    const badge = screen.getByText('GM'); // libellé de GmBadge (t('gm.badge'))
    expect(badge.closest('button.relation-stamp')).toBeTruthy();
    // Discriminant réel : à l'intérieur du bouton ne suffit pas — l'ancien bug
    // aurait aussi pu déplacer la pastille ailleurs dans le bouton (ex. près
    // de la flèche). Elle doit être dans la ligne du nom, pas seulement en flux.
    expect(badge.closest('.stamp-name')).toBeTruthy();
  });
  it('uses the ink-tone badge — the nominal plum is unreadable on the stamp', () => {
    renderList();
    const badge = screen.getByText('GM');
    expect(badge.getAttribute('style')).toContain('--gm-accent-ink');
  });
});

describe('the type picker filters by the pair', () => {
  // The brief's own locator names ("Add a relation" / "Choose a
  // character…") don't match this app's actual copy — the add button and
  // its type select share the accessible name t('character.addRelation')
  // ("Add a bond"), and the target select's is t('character.pickCharacter')
  // ("Pick a character…"); "Choose a character…" belongs to the unrelated
  // MembersList picker. Using the real accessible names here; the picker
  // behaviour under test is unchanged.
  it('offers structural types only, on a discovery sheet', () => {
    roleMock.canEdit = true;
    renderList({ characterId: charD.id, characters: [charD, charB], relations: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Add a bond' }));
    // The pair is (this sheet, the chosen target), so the filter has to react
    // to the target select too — before a target is picked, everything shows.
    fireEvent.change(screen.getByRole('combobox', { name: 'Pick a character…' }), {
      target: { value: charB.id },
    });
    const picker = screen.getByRole('combobox', { name: 'Add a bond' });
    const offered = [...picker.querySelectorAll('option')].map((o) => o.textContent);
    expect(offered).toEqual(
      ['Leads to', 'Found with', 'Concerns', 'Possessed by', 'Encounter with', 'Other'],
    );
  });

  it('never offers Leads to between two ordinary entries', () => {
    roleMock.canEdit = true;
    renderList({ characterId: charA.id, characters: [charA, charB], relations: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Add a bond' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Pick a character…' }), {
      target: { value: charB.id },
    });
    const picker = screen.getByRole('combobox', { name: 'Add a bond' });
    const offered = [...picker.querySelectorAll('option')].map((o) => o.textContent);
    expect(offered).toContain('Romance');
    expect(offered).not.toContain('Leads to');
  });

  it('drops a now-impossible selection instead of displaying one value and sending another', () => {
    roleMock.canEdit = true;
    renderList({ characterId: charA.id, characters: [charA, charB, charD], relations: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Add a bond' }));
    const picker = screen.getByRole('combobox', { name: 'Add a bond' }) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: 'romance' } });
    // Now choose the discovery: `romance` is no longer offered, and the select
    // must not keep it as its state while showing "Leads to".
    fireEvent.change(screen.getByRole('combobox', { name: 'Pick a character…' }), {
      target: { value: charD.id },
    });
    expect(picker.value).toBe('leads-to');
  });
});
