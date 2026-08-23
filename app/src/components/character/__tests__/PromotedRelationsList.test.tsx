import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const createRelation = vi.fn();
const createCharacter = vi.fn();
vi.mock('@/hooks/useRelations', () => ({
  useRelations: () => ({ createRelation, deleteRelation: vi.fn() }),
}));
vi.mock('@/hooks/useCharacters', () => ({
  useCharacters: () => ({ createCharacter }),
}));
vi.mock('@/hooks/useRole', () => ({ useCanEdit: () => true }));
vi.mock('@/stores/appStore', () => ({
  useAppStore: (sel: (s: unknown) => unknown) =>
    sel({ session: { space: { id: 'space1' } }, showToast: vi.fn() }),
}));

import { PromotedRelationsList } from '../PromotedRelationsList';
import { LanguageProvider } from '@/i18n';
import type { Character, Relation } from '@/types';

const char = (id: string, name: string, type: Character['type'], role = '') =>
  ({ id, name, type, role } as Character);
const rel = (id: string, from: string, to: string, relation_type: string) =>
  ({ id, from_character_id: from, to_character_id: to, relation_type } as Relation);

// `LanguageProvider` is not optional: `useT()` throws outside it. MembersList's
// harness wraps the same way.
const show = (characterId: string, characters: Character[], relations: Relation[]) =>
  render(
    <LanguageProvider>
      <MemoryRouter>
        <PromotedRelationsList
          characterId={characterId}
          characters={characters}
          relations={relations}
        />
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeEach(() => {
  createRelation.mockReset();
  createCharacter.mockReset();
});

describe('PromotedRelationsList', () => {
  it('heads a clue with "Points to"', () => {
    const cs = [char('c', 'Footprints', 'DISCOVERY', 'clue'), char('r', 'The miller lies', 'DISCOVERY', 'revelation')];
    show('c', cs, [rel('r1', 'c', 'r', 'leads-to')]);
    expect(screen.getByText('Points to')).toBeTruthy();
    expect(screen.getByText('The miller lies')).toBeTruthy();
  });

  it('heads its revelation with "Clues pointing here"', () => {
    const cs = [char('c', 'Footprints', 'DISCOVERY', 'clue'), char('r', 'The miller lies', 'DISCOVERY', 'revelation')];
    show('r', cs, [rel('r1', 'c', 'r', 'leads-to')]);
    expect(screen.getByText('Clues pointing here')).toBeTruthy();
    expect(screen.getByText('Footprints')).toBeTruthy();
  });

  it('heads an artifact with "Possessed by"', () => {
    const cs = [char('a', 'Red Scepter', 'DISCOVERY', 'artifact'), char('n', 'Vahid', 'PNJ')];
    show('a', cs, [rel('r1', 'a', 'n', 'held-by')]);
    expect(screen.getByText('Possessed by')).toBeTruthy();
  });

  it('heads its holder with "Possesses"', () => {
    const cs = [char('a', 'Red Scepter', 'DISCOVERY', 'artifact'), char('n', 'Vahid', 'PNJ')];
    show('n', cs, [rel('r1', 'a', 'n', 'held-by')]);
    expect(screen.getByText('Possesses')).toBeTruthy();
  });

  it('heads a site with the plain "Leads to"', () => {
    const cs = [char('s', 'The tomb', 'DISCOVERY', 'site'), char('n', 'Sajra', 'PNJ')];
    show('s', cs, [rel('r1', 's', 'n', 'leads-to')]);
    expect(screen.getByText('Leads to')).toBeTruthy();
  });

  // FINAL REVIEW, finding 3, same shape as MovesEditor's. `removePromoted` is
  // the fixed string "Remove link", and LEADS/ENCOUNTER_WITH both have
  // `cap: Infinity` — so a site with two leads rendered two remove buttons with
  // one accessible name between them, and nothing in this suite touched the
  // button at all. The TARGET's name is what tells them apart.
  it('names each remove button after the link`s target', () => {
    const cs = [
      char('s', 'The tomb', 'DISCOVERY', 'site'),
      char('n', 'Sajra', 'PNJ'),
      char('m', 'Vahid', 'PNJ'),
    ];
    show('s', cs, [rel('r1', 's', 'n', 'leads-to'), rel('r2', 's', 'm', 'leads-to')]);
    expect(screen.getByRole('button', { name: 'Remove link Sajra' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove link Vahid' })).toBeTruthy();
  });

  // The tooltip deliberately does NOT echo the target: `title={target.name}` on
  // the stamp is the row's own identity, and CharacterSheetPage's dedup tests
  // count titles matching a target to prove one row appears in exactly one
  // place. A second element carrying the name would silently break that.
  it('keeps the row`s own title the only place the target name appears as a title', () => {
    const cs = [char('s', 'The tomb', 'DISCOVERY', 'site'), char('n', 'Sajra', 'PNJ')];
    show('s', cs, [rel('r1', 's', 'n', 'leads-to')]);
    expect(screen.getAllByTitle(/Sajra/)).toHaveLength(1);
  });

  it('offers the add control while an artifact has no holder', () => {
    const cs = [char('a', 'Red Scepter', 'DISCOVERY', 'artifact'), char('n', 'Vahid', 'PNJ')];
    show('a', cs, []);
    const add = screen.getByRole('button', { name: /Possessed by/ });
    expect(add).toBeTruthy();
    // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible
    // label ("Add") and lead with it. The section heading is appended only to
    // disambiguate several add controls on one sheet. Without this assertion
    // the /Possessed by/ query above matches a bare "Possessed by" too, and
    // the prefix could be deleted with nothing failing.
    expect(add.getAttribute('aria-label')).toMatch(/^Add\b/);
  });

  // The empty line follows the KIND, like the heading does. "Possessed by"
  // over "Leads nowhere yet." was the case that read as broken.
  it('says an artifact has no holder in the artifact\'s own words', () => {
    const cs = [char('a', 'Red Scepter', 'DISCOVERY', 'artifact'), char('n', 'Vahid', 'PNJ')];
    show('a', cs, []);
    expect(screen.getByText('No one holds this yet.')).toBeTruthy();
    expect(screen.queryByText('Leads nowhere yet.')).toBeNull();
  });

  it('hides it once one holder exists (cap 1)', () => {
    const cs = [char('a', 'Red Scepter', 'DISCOVERY', 'artifact'), char('n', 'Vahid', 'PNJ')];
    show('a', cs, [rel('r1', 'a', 'n', 'held-by')]);
    expect(screen.queryByRole('button', { name: /Possessed by/ })).toBeNull();
  });

  it('renders both holders when two are stored, cap notwithstanding', () => {
    const cs = [
      char('a', 'Red Scepter', 'DISCOVERY', 'artifact'),
      char('x', 'Vahid', 'PNJ'), char('y', 'Caradoc', 'PNJ'),
    ];
    show('a', cs, [rel('r1', 'a', 'x', 'held-by'), rel('r2', 'a', 'y', 'held-by')]);
    expect(screen.getByText('Vahid')).toBeTruthy();
    expect(screen.getByText('Caradoc')).toBeTruthy();
  });

  it('offers a revelation no outgoing slot, and says so when nothing points here', () => {
    const cs = [char('r', 'The miller lies', 'DISCOVERY', 'revelation')];
    show('r', cs, []);
    expect(screen.getByText('No clues point here yet.')).toBeTruthy();
    expect(screen.queryByText('Points to')).toBeNull();
  });

  it('shows an NPC every group that points at it, each under its own heading', () => {
    const cs = [
      char('c', 'Footprints', 'DISCOVERY', 'clue'),
      char('e', 'A tinker', 'DISCOVERY', 'encounter'),
      char('n', 'Ulna', 'PNJ'),
    ];
    show('n', cs, [rel('r1', 'c', 'n', 'leads-to'), rel('r2', 'e', 'n', 'encounter-with')]);
    expect(screen.getByText('Clues pointing here')).toBeTruthy();
    expect(screen.getByText('Encounters')).toBeTruthy();
  });

  // NOT a discriminator between `t(g.groupKey)` and `t(g.config.incomingKey)`:
  // those two are equal for every incoming group that can exist, because the
  // resolver pushes with `groupKey = config.incomingKey` and the four pushing
  // configs have pairwise-distinct `incomingKey`s. Swap the read and this
  // still passes. What it pins is the component behaviour worth pinning — a
  // sheet receiving from two kinds that share a relation type renders BOTH
  // sections, each under its right heading. The resolver-level grouping (the
  // bug where a clue's and a site's `leads-to` merged into one group) is
  // covered at promotedRelations.test.ts:138; do not re-add it here.
  it('renders both incoming sections when two kinds sharing leads-to point here', () => {
    const cs = [
      char('c', 'Footprints', 'DISCOVERY', 'clue'),
      char('s', 'The tomb', 'DISCOVERY', 'site'),
      char('n', 'Ulna', 'PNJ'),
    ];
    show('n', cs, [rel('r1', 'c', 'n', 'leads-to'), rel('r2', 's', 'n', 'leads-to')]);
    expect(screen.getByText('Clues pointing here')).toBeTruthy();
    expect(screen.getByText('What leads here')).toBeTruthy();
  });

  it('renders nothing at all for a plain NPC with no promoted relations', () => {
    const { container } = show('n', [char('n', 'Ulna', 'PNJ')], []);
    expect(container.innerHTML).toBe('');
  });

  // The first-run case Step 4 exists for: a clue alone in a space has nothing
  // to point AT yet, so the picker is empty — and if the add control were
  // disabled on that alone, the one flow that fixes it would be unreachable.
  it('creates the revelation a clue points at, with nothing else in the space', async () => {
    createCharacter.mockResolvedValue({ id: 'rev-new' });
    show('c', [char('c', 'Footprints', 'DISCOVERY', 'clue')], []);
    fireEvent.click(screen.getByRole('button', { name: /Points to/ }));
    fireEvent.change(screen.getByLabelText('What do they learn?'), {
      target: { value: 'The miller lies' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'New revelation…' }));
    await waitFor(() => expect(createRelation).toHaveBeenCalled());
    expect(createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'The miller lies', type: 'DISCOVERY', role: 'revelation', gm_only: true,
      }),
    );
    expect(createRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        from_character_id: 'c', to_character_id: 'rev-new', relation_type: 'leads-to',
      }),
    );
  });
});
