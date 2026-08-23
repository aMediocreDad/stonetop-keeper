import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const updateCharacter = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useCharacters', () => ({
  useCharacters: () => ({ status: 'loaded', retry: vi.fn(), updateCharacter, deleteCharacter: vi.fn() }),
}));
const relationsMock = vi.hoisted(() => ({ relations: [] as unknown[] }));
vi.mock('@/hooks/useRelations', () => ({
  useRelations: () => ({
    relations: relationsMock.relations,
    createRelation: vi.fn(),
    updateRelation: vi.fn(),
    deleteRelation: vi.fn(),
  }),
}));
const locationsMock = vi.hoisted(() => [
  { id: 'loc-1', space_id: 'space-1', name: 'Marshedge', color: '#7AA177',
    gm_only: false, created_at: '2026-07-01T00:00:00Z' },
]);
vi.mock('@/hooks/useLocations', () => ({
  useLocations: () => ({ locations: locationsMock, createLocation: vi.fn() }),
}));
// Mutable par test (roleMock.isGm = false) pour couvrir la branche joueur de
// la garde d'instinct — la plupart des suites veulent le MJ, par défaut.
// `canEdit` is likewise mutable (default true, matching the old hard-coded
// value) so a single test can flip it to pin a viewer-can't-tick guard, e.g.
// `toggleConsequence`'s `if (!canEdit) return`.
const roleMock = vi.hoisted(() => ({ isGm: true, canEdit: true }));
// Spread the real module rather than listing exports: this page renders the
// header, so it pulls in every capability hook SpaceSwitcher uses, and an
// exhaustive list breaks the whole file the next time one is added.
vi.mock('@/hooks/useRole', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useRole')>()),
  useCanEdit: () => roleMock.canEdit,
  useIsGm: () => roleMock.isGm,
}));
// TipTap n'a pas de précédent de rendu dans cette suite — stub, comme GmJournalPage.
vi.mock('@/components/shared/RichText', () => ({ RichText: () => null }));
vi.mock('@/components/shared/GmNotesCard', () => ({ GmNotesCard: () => null }));
vi.mock('@/components/timeline/ChronicleBacklinks', () => ({ ChronicleBacklinks: () => null }));
vi.mock('@/components/maps/PinnedOnMaps', () => ({ PinnedOnMaps: () => null }));

import CharacterSheetPage from '@/pages/CharacterSheetPage';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { emptyThreatSheet } from '@/lib/character/threatSheet';
import { emptyStatBlock } from '@/lib/character/statblock';
import type { Character } from '@/types';

const pc: Character = {
  id: 'c-1', space_id: 'space-1', name: 'Rhianna',
  role: 'Blessed · Initiate', type: 'PJ', notes: '', instinct: '',
  traits: [], tags: [], gm_only: false, dead: false, gm_notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
};

const npc: Character = {
  ...pc, id: 'c-2', name: 'Elios',
  role: 'farmer, ex-mercenary', type: 'PNJ',
};

// A FACTORY, not a fixed object: Task 8 needs a per-test `discovery` block
// override, and a plain object would need a second same-entity fixture to get
// it — the "second harness" this file's own convention forbids. Overrides are
// applied last, so `discovery({ role: 'clue' })` reads exactly like the old
// `{ ...discovery, role: 'clue' }` spread it replaces.
function discovery(overrides: Partial<Character> = {}): Character {
  return {
    ...pc, id: 'd-1', name: 'The bronze plate', type: 'DISCOVERY', role: 'arcanum',
    traits: [{ label: 'dig it up & clean it', checked: true },
             { label: 'decipher the Maker-runes', checked: false }],
    gm_only: true,
    // `''` and NOT the `null` inherited from `pc`. draftFromCharacter does
    // `gm_notes ?? ''`, handleSave sends gm_notes for a GM, and changedKeys'
    // deepEqual short-circuits on `a === null` — so a null baseline makes
    // `gm_notes: ''` count as a change and ride along on every GM save. Every
    // other assertion in this file uses `objectContaining` to live with that
    // noise; the patch test below needs an EXACT payload, because "only the
    // changed key is sent" is the thing it exists to prove.
    gm_notes: '',
    // Same reasoning, two more columns: `pc` carries neither `location` nor
    // `kind` as an OWN key, so changedKeys' `hasOwnProperty` guard treats them
    // as changed no matter what the draft holds — the save unconditionally
    // computes both (location: draft.location ?? null, kind: draft.kind for a
    // GM) and a baseline missing the key can never look "unchanged". A real
    // row always has both columns; only this hand-built fixture doesn't.
    location: null,
    kind: null,
    ...overrides,
  };
}

function renderSheet(character: Character, state?: { edit?: boolean }, cast: Character[] = []) {
  useAppStore.setState({
    session: { space: { id: 'space-1', name: 'Toa', invite_code: 'X', created_at: '', updated_at: '' },
      isAdmin: true, token: 'tok', role: 'gm' },
    characters: [character, ...cast],
  });
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[{ pathname: `/character/${character.id}`, state }]}>
        <Routes><Route path="/character/:id" element={<CharacterSheetPage />} /></Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

// Every existing test spells this out inline (`fireEvent.click(screen.getByRole
// ('button', { name: 'Edit' }))`); this helper is only for Task 8's new block
// below, which needs it seven times — not a second harness, the same click.
function enterEditMode() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

afterEach(() => cleanup());
beforeEach(() => {
  updateCharacter.mockClear();
  roleMock.isGm = true;
  roleMock.canEdit = true;
  relationsMock.relations = [];
});

describe('role editing', () => {
  it('keeps spaces while typing the PJ background', () => {
    renderSheet(pc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByDisplayValue('Initiate') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Initiate of ' } });
    // getByDisplayValue trime par défaut (normalizer) — un espace de fin y
    // serait invisible même si le DOM le porte bien : on lit .value en direct.
    expect(input.value).toBe('Initiate of ');
    fireEvent.change(input, { target: { value: 'Initiate of Danu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // compose au save : préfixe livret + reste trimé
    expect(updateCharacter).toHaveBeenCalledWith('c-1',
      expect.objectContaining({ role: 'Blessed · Initiate of Danu' }));
  });
});

describe('per-type labels', () => {
  it('labels the PJ role field "Background"', () => {
    renderSheet(pc);
    expect(screen.getByText(/Background$/)).toBeTruthy();
  });
  it('labels the PNJ role field "Role"', () => {
    renderSheet(npc);
    expect(screen.getByText(/^Role$/)).toBeTruthy();
    expect(screen.queryByText(/Occupation/)).toBeNull();
  });
  it('reads the PJ playbook on its own row, not concatenated into Background', () => {
    renderSheet(pc); // role: 'Blessed · Initiate'
    expect(screen.getByText(/^Playbook$/)).toBeTruthy();
    expect(screen.getByText('Blessed')).toBeTruthy();
    expect(screen.getByText('Initiate')).toBeTruthy();
    expect(screen.queryByText(/Blessed\s*·\s*Initiate/)).toBeNull();
  });
  it('no longer renders the redundant Type row', () => {
    renderSheet(npc);
    expect(screen.queryByText(/^Type$/)).toBeNull();
  });
});

/**
 * Sortie de jeu — décédé (PJ/PNJ) ou dissous (GROUPE). Le risque de cette
 * colonne est le silence : sans la clé dans l'allow-list de update_character
 * (supabase-deceased.sql), la case coche, la pastille s'affiche, et rien ne
 * part. On vérifie donc la CHARGE envoyée, pas seulement l'écran.
 */
describe('deceased', () => {
  it('sends the flag on save', () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deceased' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateCharacter).toHaveBeenCalledWith('c-2',
      expect.objectContaining({ dead: true }));
  });

  it('sends false again when the box is cleared', () => {
    renderSheet({ ...npc, dead: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deceased' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateCharacter).toHaveBeenCalledWith('c-2',
      expect.objectContaining({ dead: false }));
  });

  // La case dit le même mot que la pastille, et il suit le type : « Deceased »
  // pour un PNJ, « Disbanded » pour un groupe.
  it('labels the box for the type', () => {
    renderSheet({ ...npc, type: 'GROUPE' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Disbanded' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deceased' })).toBeNull();
  });

  it('shows the state chip out of edit mode', () => {
    renderSheet({ ...npc, dead: true });
    expect(screen.getByText('Deceased')).toBeTruthy();
    cleanup();
    renderSheet({ ...npc, type: 'GROUPE', dead: true });
    expect(screen.getByText('Disbanded')).toBeTruthy();
  });

  // La fin d'une menace, ce sont ses présages et sa fatalité — pas cette case.
  it('offers no box on a threat', () => {
    renderSheet({ ...npc, type: 'MENACE' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: 'Deceased' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disbanded' })).toBeNull();
  });
});

describe('instinct', () => {
  it('shows and saves the instinct for an NPC', () => {
    renderSheet({ ...npc, instinct: 'complain but get the job done' });
    expect(screen.getByText(/complain but get the job done/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    const input = screen.getByDisplayValue('complain but get the job done');
    fireEvent.change(input, { target: { value: 'get the job done' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(updateCharacter).toHaveBeenCalledWith('c-2',
      expect.objectContaining({ instinct: 'get the job done' }));
  });
  it('falls back to legacy threat.instinct for a restored MENACE revision', () => {
    renderSheet({ ...npc, id: 'c-3', type: 'MENACE', role: 'Undead', instinct: '',
      threat: { instinct: 'hollow out the hill', portents: [], stakes: [],
        gmMoves: [], impendingDoom: { text: '', done: false } } });
    expect(screen.getByText(/hollow out the hill/)).toBeTruthy();
  });
  it('hides the instinct row from a player viewing a non-follower NPC', () => {
    // Le serveur ignore déjà ces écritures joueur (task 3) — un champ visible
    // mais sans effet révélerait l'existence de la donnée à un spectateur.
    roleMock.isGm = false;
    renderSheet({ ...npc, instinct: 'stay hidden from outsiders' });
    expect(screen.queryByText(/^Instinct$/)).toBeNull();
    // Pas seulement le libellé : la valeur elle-même ne doit fuiter nulle part.
    expect(screen.queryByText(/stay hidden from outsiders/)).toBeNull();
  });
  it('still shows the instinct row to a player viewing a follower NPC', () => {
    roleMock.isGm = false;
    renderSheet({ ...npc, instinct: 'protect the herd',
      follower: { cost: '1 gold', loyalty: 2 } });
    expect(screen.getByText(/^Instinct$/)).toBeTruthy();
  });

  // Rien ne distinguait à l'écran une ligne publique d'une ligne MJ-seul : le
  // MJ voit tout, donc il ne pouvait pas savoir ce qui fuit vers les joueurs.
  it('marks the instinct row GM-only on a non-follower, and not on a follower', () => {
    renderSheet({ ...npc, instinct: 'stay hidden' });
    expect(screen.getByTitle(/Only you can see this instinct/)).toBeTruthy();

    cleanup();
    renderSheet({ ...npc, instinct: 'protect the herd',
      follower: { cost: '', loyalty: 0, leaderId: null } });
    expect(screen.queryByTitle(/Only you can see this instinct/)).toBeNull();
  });

  it('drops the instinct GM-only mark live when the Follower box is ticked', () => {
    renderSheet({ ...npc, instinct: 'stay hidden' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTitle(/Only you can see this instinct/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Follower' }));
    expect(screen.queryByTitle(/Only you can see this instinct/)).toBeNull();
  });
});

describe('traits', () => {
  it('adds traits as chips and saves the full list', async () => {
    renderSheet({ ...npc, traits: [{ label: 'humorless', checked: false }] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByLabelText('Traits');
    fireEvent.change(input, { target: { value: 'ex-mercenary' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].traits).toEqual([
      { label: 'humorless', checked: false },
      { label: 'ex-mercenary', checked: false },
    ]);
  });
  it('PNJ: legacy multi-entry list renders every entry (nothing silently hidden)', () => {
    renderSheet({ ...npc, traits: [
      { label: 'humorless', checked: true },
      { label: 'ex-mercenary', checked: false },
    ] });
    expect(screen.getByText('humorless')).toBeTruthy();
    expect(screen.getByText('ex-mercenary')).toBeTruthy();
  });
  // A PNJ's (and PJ's/GROUPE's/MENACE's) traits are memorable impressions,
  // not a checklist — `checked` is inert for them by design, so the chip
  // must carry no tick affordance at all. Only a DISCOVERY's requirements
  // are tickable (see 'the DISCOVERY sheet' below).
  it('gives a PNJ trait chip no tick control', () => {
    renderSheet({ ...npc, traits: [{ label: 'humorless', checked: false }] });
    expect(screen.queryByRole('button', { name: 'humorless' })).toBeNull();
  });
  it('PJ: no traits row at all when empty', () => {
    renderSheet(pc);
    expect(screen.queryByText(/^Traits$/i)).toBeNull();
  });
  it('PNJ: the traits row sits in the Informations card, under Role', () => {
    renderSheet({ ...npc, traits: [{ label: 'humorless', checked: false }] });
    // Les libellés n'ont plus de deux-points : la grille libellé/contrôle
    // aligne les valeurs, la ponctuation ne sépare plus rien.
    const rows = screen.getAllByText(/^(Role|Traits|Instinct)$/);
    expect(rows.map((el) => el.textContent)).toEqual(['Role', 'Traits', 'Instinct']);
  });
});

describe('threat type', () => {
  it('promotes a mapped legacy prefix into threat.type and leaves role untouched', async () => {
    // Select intouché : couvre la seed du sync-in (CharacterSheetPage ~125)
    // qui pose localThreatType depuis legacyThreatRole au montage — une
    // régression vers `character.threat?.type ?? null` écrirait type:null
    // en silence, donc ce cas doit rester distinct du test d'override
    // ci-dessous.
    //
    // `role` repart VERBATIM. Une menace n'a plus de champ Rôle du tout, donc
    // il n'y a plus rien à dépouiller pour l'affichage — et un save ne doit
    // pas réécrire une colonne que l'écran n'offre plus (les vieilles fiches
    // y gardent « Magical entity (Nearby) » & co jusqu'à un nettoyage
    // explicite).
    renderSheet({ ...npc, id: 'c-4', type: 'MENACE', role: 'Beast · the hagr', threat: emptyThreatSheet() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    const payload = updateCharacter.mock.calls[0][1];
    // Le save n'écrit plus que les colonnes modifiées, donc « role repart
    // verbatim » se lit désormais comme « role n'est pas envoyé du tout » :
    // la colonne n'est pas réécrite, ce que le commentaire ci-dessus demande,
    // en plus fort qu'un renvoi à l'identique.
    expect('role' in payload).toBe(false);
    expect(payload.threat.type).toBe('beast');
  });

  it('shows the legacy-promoted type as a read-mode chip, and a select override wins on save', async () => {
    renderSheet({ ...npc, id: 'c-5', type: 'MENACE', role: 'Beast · the hagr', threat: emptyThreatSheet() });
    // Chip prune en lecture, avant tout save : threatTypeOf lit déjà le
    // préfixe legacy (« Beast · … ») via legacyThreatRole, pas seulement
    // threat.type en base.
    expect(screen.getByText('Beast')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // Le MJ peut corriger la proposition legacy : le select gagne au save.
    fireEvent.change(screen.getByLabelText(/^Type$/), { target: { value: 'villain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    const payload = updateCharacter.mock.calls[0][1];
    // Idem : la colonne role n'est pas touchée par un save qui ne la modifie
    // pas — seule la correction du select part.
    expect('role' in payload).toBe(false);
    expect(payload.threat.type).toBe('villain');
  });

  // LA forme que la règle vise : une menace qui PORTE un bloc follower —
  // écrit avant la règle, ou ressuscité par une restauration de révision (ici
  // sous sa forme imbriquée d'origine, celle que db.ts hisse en colonne au
  // chargement). Rien ne doit la traiter en follower : pas de carte Follower,
  // et l'instinct comme le bloc de stats restent marqués « MJ seul » — c'est
  // exactement ce que le serveur applique de son côté.
  it('never treats a threat carrying a follower block as a follower', () => {
    renderSheet({
      ...npc, id: 'c-14', type: 'MENACE', role: '', threat: emptyThreatSheet(),
      instinct: 'hunt the ones who trespass',
      statblock: {
        ...emptyStatBlock(), hp: 20,
        follower: { cost: 'a life', loyalty: 1 },
      } as unknown as Character['statblock'],
    });
    expect(screen.queryByText('Follower')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Loyalty' })).toBeNull();
    expect(screen.getByTitle(/Only you can see this instinct/)).toBeTruthy();
  });

  // La règle elle-même, côté écran : pas de champ Rôle, pas de case Follower.
  it('offers a threat neither a Role field nor the Follower checkbox', () => {
    renderSheet({ ...npc, id: 'c-13', type: 'MENACE', role: 'Magical entity (Nearby)',
      threat: emptyThreatSheet() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText(/^Role$/)).toBeNull();
    // Le texte stocké ne s'affiche nulle part sur la fiche…
    expect(screen.queryByDisplayValue('Magical entity (Nearby)')).toBeNull();
    expect(screen.queryByText('Magical entity (Nearby)')).toBeNull();
    // …mais « Monstre » reste (le tampon du bestiaire), seul « Follower » part.
    expect(screen.queryByLabelText(/Follower/)).toBeNull();
    expect(screen.getByLabelText(/Monster/)).toBeTruthy();
  });
});

describe('stat block', () => {
  it('saves a loyalty tick immediately outside edit mode', async () => {
    renderSheet({ ...npc, follower: { cost: 'recognition', loyalty: 1, leaderId: null } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Loyalty 2' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ follower: expect.objectContaining({ loyalty: 2 }) }),
    ));
  });

  // Un monstre comme un follower ont des PV et une armure dans le livre,
  // et rien d'autre n'en a : ce sont
  // donc les deux cases qui font naître et mourir le bloc — plus de bouton
  // « Add stat block » qui pourrait dire autre chose.
  it('the Monster box creates the stat block, and it rides the save', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Stat block')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    expect(screen.getByText('Stat block')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].statblock).toMatchObject({ hp: 6 });
  });

  it('the Follower box creates it too', () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follower' }));
    expect(screen.getByText('Stat block')).toBeTruthy();
  });

  // Décocher les deux le retire : c'est le pendant de la création, et il n'y a
  // plus de lien « Remove stat block » pour le faire autrement.
  it('unticking both boxes removes the stat block and saves an explicit null', async () => {
    renderSheet({ ...npc, kind: 'beast', statblock: { ...emptyStatBlock(), damage: 'claws d8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Stat block')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    expect(screen.queryByText('Stat block')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].statblock).toBeNull();
  });

  // …mais pas si l'autre case tient encore : un fauve apprivoisé qu'on
  // « démonstrifie » reste un follower, donc il garde ses stats.
  it('keeps the stat block when the other box still holds it', () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follower' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    expect(screen.getByText('Stat block')).toBeTruthy();
  });

  // Les deux classifications de fiche ont quitté la carte de stats pour la
  // carte Informations, et surtout le JSONB pour leurs propres colonnes : le
  // PNJ ci-dessous n'a AUCUN stat block, et les deux contrôles répondent. Le
  // sélecteur de bestiaire, lui, n'apparaît que sous la case Monstre.
  it('reveals the bestiary select only once Monster is ticked, and saves the kind', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText(/^Type$/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    // Cochée, la case pose une catégorie VISIBLE tout de suite (pas un vide
    // qu'il faudrait deviner) — même esprit que les 6 PV d'emptyStatBlock.
    const select = screen.getByLabelText(/^Type$/) as HTMLSelectElement;
    expect(select.value).toBe('beast');
    fireEvent.change(select, { target: { value: 'undead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].kind).toBe('undead');
    // La case a aussi fait naître le bloc de stats (un monstre a des PV).
    expect(updateCharacter.mock.calls[0][1].statblock).toMatchObject({ hp: 6 });
  });

  // `npc` EST la valeur « pas un monstre » : c'est la case qui la pose, elle
  // n'a donc rien à faire dans une liste de natures de monstre.
  it('unticking Monster returns an NPC to the neutral npc kind', async () => {
    renderSheet({ ...npc, kind: 'undead' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const box = screen.getByRole('button', { name: 'Monster' });
    expect(box.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(box);
    expect(screen.queryByLabelText(/^Type$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].kind).toBe('npc');
  });

  // Un groupe est un TYPE D'ENTITÉ ici, pas une nature de monstre : offrir
  // « Group » sous « Type » ne dit rien de plus, ni sur un PNJ ni sur un
  // GROUPE. Une MENACE le garde — là le sélecteur est un choix de tampon.
  it('drops npc and the group kind from the NPC and GROUPE lists, keeps it for a MENACE', () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    const options = [...(screen.getByLabelText(/^Type$/) as HTMLSelectElement).options]
      .map((o) => o.value);
    expect(options).toContain('undead');
    expect(options).not.toContain('faction');
    expect(options).not.toContain('npc');
    expect(options).not.toContain('');

    cleanup();
    renderSheet({ ...npc, id: 'c-7', type: 'GROUPE', role: 'the town militia' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    expect([...(screen.getByLabelText(/^Type$/) as HTMLSelectElement).options]
      .map((o) => o.value)).not.toContain('faction');

    cleanup();
    renderSheet({ ...npc, id: 'c-12', type: 'MENACE', role: 'the council',
      threat: emptyThreatSheet() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    const menaceOptions = [...(screen.getByLabelText(/^Icon$/) as HTMLSelectElement).options];
    expect(menaceOptions.map((o) => o.value)).toContain('faction');
    // Et il s'appelle « Group », plus « Faction ».
    expect(menaceOptions.find((o) => o.value === 'faction')?.textContent).toBe('Group');
  });

  it('a MENACE keeps "Icon" for the bestiary category — "Type" is the threat type', () => {
    renderSheet({ ...npc, id: 'c-6', type: 'MENACE', role: 'the hagr',
      threat: emptyThreatSheet() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    expect(screen.getByLabelText(/^Icon$/)).toBeTruthy();
    // Une seule ligne « Type », celle du type de menace.
    expect(screen.getAllByLabelText(/^Type$/)).toHaveLength(1);
  });

  // Monstre et Follower sont deux axes, pas trois branches : un fauve
  // apprivoisé est les deux à la fois (« a follower, monster, and/or threat »).
  it('Monster and Follower are independent — a beast follower is both', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follower' }));
    expect(screen.getByRole('button', { name: 'Monster' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Follower' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    const payload = updateCharacter.mock.calls[0][1];
    expect(payload.kind).toBe('beast');
    expect(payload.follower).toEqual({ cost: '', loyalty: 0, leaderId: null });
  });

  // La couche follower (coût/loyauté/meneur) vit sur SA carte, distincte des
  // stats — deux colonnes indépendantes en base. Les deux naissent ensemble
  // par la case, parce qu'un follower du livre a des PV et une armure
  //, mais elles restent séparables côté données.
  it('the Follower box adds the follower block on its own card', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const box = screen.getByRole('button', { name: 'Follower' });
    fireEvent.click(box);
    expect(box.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Cost')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].follower)
      .toEqual({ cost: '', loyalty: 0, leaderId: null });
  });

  // Une ligne statless reste lisible : le MCP ou une révision restaurée
  // peuvent en produire, la carte de follower ne dépend pas des stats.
  it('renders a statless follower row without inventing stats', () => {
    renderSheet({ ...npc, follower: { cost: 'a forge', loyalty: 1, leaderId: null } });
    expect(screen.getByText('a forge')).toBeTruthy();
    expect(screen.queryByText('Stat block')).toBeNull();
  });

  // ONE-WAY DOOR (supabase-statblock.sql) : un joueur qui décoche une fiche
  // follower perd l'accès à la ligne sans pouvoir revenir. La bascule est donc
  // MJ-seul, comme « Add stat block ».
  it('hides the Follower box and the bestiary select from a player', () => {
    roleMock.isGm = false;
    renderSheet({ ...npc, follower: { cost: '', loyalty: 0, leaderId: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: 'Follower' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Monster' })).toBeNull();
    expect(screen.queryByLabelText(/^Type$/)).toBeNull();
  });

  // Sans ce garde, un joueur qui édite une fiche masquée (pas encore vue
  // comme follower) enverrait un null aveugle : si le MJ promeut la ligne en
  // follower entre-temps, ce null passerait la garde RPC (elle teste l'état
  // stocké au moment du write) et effacerait le bloc du MJ en silence.
  it('omits the statblock key entirely when the editor never saw one (no blind null overwrite)', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByDisplayValue(npc.name) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Elios the Elder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1]).not.toHaveProperty('statblock');
  });

  // Restauration d'une révision antérieure à la migration : `kind` revient
  // imbriqué dans le bloc, la colonne est vide. Le save renvoie un
  // `statblock` que normalizeStatBlock a dépouillé de la clé — si `kind`
  // n'accompagnait pas l'envoi, la classification disparaîtrait. Un joueur
  // peut se trouver dans ce cas : la fiche d'un follower lui est ouverte.
  it('carries a hoisted legacy kind on a player save of a follower row', async () => {
    roleMock.isGm = false;
    renderSheet({ ...npc, follower: { cost: '', loyalty: 0, leaderId: null },
      statblock: { ...emptyStatBlock(), kind: 'undead' } as never });
    // Monstre par la valeur héritée : la case est déjà cochée.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    const payload = updateCharacter.mock.calls[0][1];
    expect(payload.kind).toBe('undead');
    expect(payload.statblock).not.toHaveProperty('kind');
  });

  // Un `null` de joueur, lui, ne part jamais : ce serait le null aveugle
  // d'une ligne masquée, qui écraserait la valeur du MJ. Fixture GROUPE :
  // un PNJ ne peut plus produire de kind null (« NPC » par défaut), un
  // groupe suiveur — une troupe engagée — si.
  it('never sends a null kind from a player', async () => {
    roleMock.isGm = false;
    renderSheet({ ...npc, id: 'c-9', type: 'GROUPE', role: 'a hired crew',
      follower: { cost: '', loyalty: 0, leaderId: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1]).not.toHaveProperty('kind');
  });

  // « NPC » est la catégorie neutre : un PNJ ordinaire n'est pas un monstre,
  // et l'enregistre tel quel.
  it('leaves a plain NPC unticked and saves the neutral npc kind', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Monster' }).getAttribute('aria-pressed'))
      .toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].kind).toBe('npc');
  });

  it('does not default a threat — a threat is not a monster unless said so', () => {
    renderSheet({ ...npc, id: 'c-10', type: 'MENACE', role: 'the hagr',
      threat: emptyThreatSheet() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Monster' }).getAttribute('aria-pressed'))
      .toBe('false');
    expect(screen.queryByLabelText(/^Icon$/)).toBeNull();
  });

  // Un type explicite gagne, évidemment — et il coche la case.
  it('keeps an explicit kind instead of the default', () => {
    renderSheet({ ...npc, kind: 'hazard' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Monster' }).getAttribute('aria-pressed'))
      .toBe('true');
    expect((screen.getByLabelText(/^Type$/) as HTMLSelectElement).value).toBe('hazard');
  });

  // `faction` a quitté la liste des PNJ, mais une vieille ligne peut encore
  // la porter : la retirer du select afficherait du vide tout en
  // réenregistrant « faction ».
  it('keeps an out-of-list stored kind selectable instead of showing a blank select', () => {
    renderSheet({ ...npc, kind: 'faction' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const select = screen.getByLabelText(/^Type$/) as HTMLSelectElement;
    expect(select.value).toBe('faction');
    expect([...select.options].map((o) => o.value)).toContain('faction');
  });

  // Un joueur n'a aucune des deux cases, donc aucun moyen de faire naître un
  // bloc — la garde qui remplace l'ancien bouton « Add stat block » MJ-seul.
  it('gives a player no way to create a stat block', () => {
    roleMock.isGm = false;
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: 'Monster' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Follower' })).toBeNull();
    expect(screen.queryByText('Stat block')).toBeNull();
  });

  it('never mounts the stat block card for a PJ, even if the row carries one', () => {
    renderSheet({ ...pc, statblock: { ...emptyStatBlock(), damage: 'claws d8' } });
    expect(screen.queryByText('Stat block')).toBeNull();
  });
});

// Le formulaire de création ne demande qu'un nom et un type, puis renvoie ici
// avec `state.edit` — tout le reste se remplit sur la fiche.
describe('landing in edit mode from the creation dialog', () => {
  it('opens in edit mode with the drafts already hydrated (not blank fields)', () => {
    renderSheet({ ...npc, role: 'farmer' }, { edit: true });
    // En édition : les boutons Save/Cancel remplacent Edit/Delete…
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    // …et les champs portent DÉJÀ les valeurs de la ligne. C'est le vrai piège :
    // l'effet de synchro s'interdit de tourner pendant l'édition, donc basculer
    // trop tôt laisserait des champs vides et le premier Save viderait la ligne.
    expect((screen.getByDisplayValue('Elios') as HTMLInputElement).value).toBe('Elios');
    expect(screen.getByDisplayValue('farmer')).toBeTruthy();
  });

  it('stays in read mode without the flag', () => {
    renderSheet(npc);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

// Les tags sont des STATS de jeu (« Game stats: tags, HP,
// armor, damage, and GM moves »), ils n'arrivent qu'avec la couche follower
// ou monstre. Un PNJ ordinaire porte des traits mémorables
// à la place.
describe('tags belong to the statted layer', () => {
  const tagged = { ...npc, tags: ['organized', 'skilled'] };

  it('hides the tags field from a plain NPC and from a PC', () => {
    renderSheet(tagged);
    expect(screen.queryByText('Tags')).toBeNull();

    cleanup();
    renderSheet({ ...pc, tags: ['Stonetop'] });
    expect(screen.queryByText('Tags')).toBeNull();
  });

  // En LECTURE, plus de section « Tags » : ils remontent sous le nom, dans la
  // ligne de descripteurs, là où une menace montre son type — l'anatomie du
  // livre, et la même ligne que sur la carte du grimoire.
  it('reads a monster’s tags under the name, not in a section of their own', () => {
    renderSheet({ ...tagged, kind: 'beast' });
    expect(screen.queryByText('Tags')).toBeNull();
    expect(screen.getByText('organized, skilled')).toBeTruthy();
  });

  // Un groupe-follower est une troupe, et une troupe a des tags
  // (« if you're creating a group follower, pick tags that apply to the
  // entire group ») — « les groupes n'ont pas de tags » ne vaut que non statté.
  it('shows it on a follower, including a follower GROUPE (a crew)', () => {
    renderSheet({ ...tagged, follower: { cost: '', loyalty: 0, leaderId: null } });
    expect(screen.getByText('organized, skilled')).toBeTruthy();

    cleanup();
    renderSheet({ ...tagged, id: 'c-11', type: 'GROUPE', role: 'a hired crew',
      follower: { cost: 'silver', loyalty: 1, leaderId: null } });
    expect(screen.getByText('organized, skilled')).toBeTruthy();
  });

  // En ÉDITION, la saisie vit dans le bloc de stats : les tags sont des stats
  // de jeu, pas une troisième catégorie à côté des traits.
  it('edits the tags inside the stat block card', () => {
    renderSheet({ ...tagged, kind: 'beast', statblock: emptyStatBlock() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const statBlock = screen.getByText('Stat block').closest('div.card-paper') as HTMLElement;
    expect(statBlock.textContent).toContain('Tags');
    expect(statBlock.textContent).toContain('organized');
  });

  // Repli : le MCP crée des followers SANS stats, et une révision restaurée en
  // ressuscite. Sans bloc de stats il n'y a pas de maison principale, donc la
  // saisie revient dans la carte Informations — jamais les deux à la fois.
  it('falls back to the Informations card when the row has no stat block', () => {
    renderSheet({ ...tagged, follower: { cost: '', loyalty: 0, leaderId: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Stat block')).toBeNull();
    const info = screen.getByText('Information').closest('div.card-paper') as HTMLElement;
    expect(info.textContent).toContain('Tags');
    expect(info.textContent).toContain('organized');
  });

  it('appears live the moment Monster is ticked', () => {
    renderSheet(tagged);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Tags')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Monster' }));
    expect(screen.getByText('Tags')).toBeTruthy();
  });

  // Masquer n'est PAS supprimer : 53 lignes de ce grimoire portent des tags
  // sur des types qui n'y ont plus droit, et un save ne doit pas les manger.
  it('round-trips hidden tags through a save without losing them', async () => {
    renderSheet(tagged);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Tags')).toBeNull();
    // Une modification SANS rapport, pour que le save ait quelque chose à
    // écrire : la question est de savoir si les tags masqués survivent à un
    // vrai save, pas si un save vide les épargne.
    fireEvent.change(screen.getByDisplayValue(tagged.name), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    // La colonne tags n'est pas envoyée, donc pas réécrite : rien n'est mangé.
    expect('tags' in updateCharacter.mock.calls[0][1]).toBe(false);
  });
});

/**
 * Same silence as `dead` above, one layer lower: the picker's "no location" is
 * `undefined`, and `JSON.stringify` DROPS an undefined-valued key on the way to
 * the RPC. The allow-list writes the column only when the key is there
 * (`case when p_data ? 'location'`), so an absent key means "leave it alone" —
 * the field cleared on screen, saved silently, and came back on the next resync.
 * Hence the round-trip below: `toEqual`/`objectContaining` treat an
 * undefined-valued key as absent, so they would pass on the broken payload too.
 */
describe('location', () => {
  it('sends an explicit null when "No location" is picked', async () => {
    renderSheet({ ...npc, location: 'loc-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marshedge' })); // open the picker
    fireEvent.click(screen.getByRole('button', { name: 'No location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

    const sent = JSON.parse(JSON.stringify(updateCharacter.mock.calls[0][1]));
    expect('location' in sent).toBe(true);
    expect(sent.location).toBeNull();
  });

  // The other half of the trip: the column now stores `null`, the picker only
  // speaks `undefined`. A row cleared by the save above must come back as an
  // empty picker — not a blank chip, and not the stale place.
  it('hydrates a stored null as "no location"', () => {
    renderSheet({ ...npc, location: null });
    expect(screen.queryByText('Marshedge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Pick a location…' })).toBeTruthy();
  });

  it('still sends the id when a location is picked', async () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick a location…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marshedge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
    expect(updateCharacter.mock.calls[0][1].location).toBe('loc-1');
  });
});

describe('descriptor line', () => {
  // Trois pastilles alignées (« Threat », son type, « GM ») lisaient comme un
  // tableau de bord : le type descend sous le nom, en italique du livre.
  it('reads the threat type under the name instead of a third badge', () => {
    renderSheet({ ...npc, id: 'c-8', type: 'MENACE', role: 'the hagr',
      threat: { ...emptyThreatSheet(), type: 'villain' } });
    const descriptor = screen.getByText('Villain');
    expect(descriptor.tagName).toBe('P');
    expect(descriptor.className).toContain('italic');
  });

  it('shows nothing extra for a plain NPC', () => {
    renderSheet(npc);
    expect(screen.queryByText('Villain')).toBeNull();
  });
});

/**
 * Partial saves — the multiplayer half of the sheet.
 *
 * The save handler builds a payload from the WHOLE draft, so before this the
 * sheet wrote every column on every save: two people editing different fields
 * of the same character silently overwrote one another, and the only defence
 * was a growing set of per-field guards in `handleSave`. The RPCs are per-key
 * partial updates already, so the fix is to send only what changed.
 */
describe('partial saves', () => {
  it('sends only the field the editor changed', () => {
    renderSheet(npc);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('Elios'), { target: { value: 'Elios the Grey' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const sent = updateCharacter.mock.calls[0][1];
    expect(sent.name).toBe('Elios the Grey');
    // The fields nobody touched must not be in the payload at all — their
    // presence is what overwrites a concurrent edit.
    for (const untouched of ['role', 'notes', 'traits', 'tags', 'dead', 'instinct']) {
      expect(Object.keys(sent)).not.toContain(untouched);
    }
  });

  it('does not call the RPC when a save follows no edit at all', () => {
    // Already normalised on purpose. The sheet deliberately uses a save to
    // migrate legacy rows (`instinct` promoted out of threat, a legacy "Beast ·"
    // prefix into threat.type, the `kind` default written through), so on a row
    // that still needs migrating a no-edit save legitimately writes something.
    // The no-op property is about a row with nothing left to migrate.
    renderSheet({ ...npc, gm_notes: '', kind: 'npc', location: null });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // An empty patch would still bump updated_at and mint a ledger entry.
    expect(updateCharacter).not.toHaveBeenCalled();
  });

  it('does not resend a masked statblock a player never saw', () => {
    roleMock.isGm = false;
    // A player reads `statblock` as null because the server masks it. Sending
    // that null back is how a concurrent follower promotion by the GM died.
    renderSheet({ ...npc, statblock: null });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('Elios'), { target: { value: 'Elios II' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const sent = updateCharacter.mock.calls[0][1];
    expect(Object.keys(sent)).not.toContain('statblock');
  });
});

describe('the DISCOVERY sheet', () => {
  it('names the type and its kind, not "Threat"', () => {
    renderSheet(discovery());
    expect(screen.getByText('Discovery')).toBeTruthy();
    expect(screen.queryByText('Threat')).toBeNull();
  });

  it('edits the subtype through a select that writes `role`', () => {
    renderSheet(discovery());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const select = screen.getByRole('combobox', { name: 'Kind' }) as HTMLSelectElement;
    expect(select.value).toBe('arcanum');
    fireEvent.change(select, { target: { value: 'artifact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    return waitFor(() => {
      // A field-level patch: only the key that changed is sent (lib/patch).
      expect(updateCharacter).toHaveBeenCalledWith('d-1', { role: 'artifact' });
    });
  });

  // The crux of Task 7's edit-mode gate: `discoveryTagsLive` must read
  // `draft.roleRest`, not the stored `character.role` — otherwise choosing
  // "Artifact" would not reveal the field until after a save, the same trap
  // `monsterLive` already avoids for the Monster checkbox (cf. line 741's
  // sibling test for that case).
  it('reveals the Tags field the moment Artifact is chosen, before any save', () => {
    renderSheet(discovery({ role: 'clue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Tags')).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Kind' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'artifact' } });
    expect(screen.getByText('Tags')).toBeTruthy();
  });

  it('offers no Unfiled option, and lands an unfiled row on the first kind', () => {
    // Unfiled stopped being SELECTABLE (owner's call) but is still a real
    // stored state — an MCP write or an old row can carry `role: ''`. The
    // contract that replaced "it is in the list" is that such a row arrives
    // already seeded with the default, so the select never shows a value the
    // draft does not hold. Exhaustive `toEqual`, so a kind added out of
    // alphabetical order fails here too.
    renderSheet(discovery({ role: '' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const select = screen.getByRole('combobox', { name: 'Kind' }) as HTMLSelectElement;
    expect(select.value).toBe('arcanum');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Arcanum', 'Artifact', 'Clue', 'Encounter', 'Opportunity', 'Revelation', 'Site',
    ]);
  });

  it('never destroys an unrecognised stored kind, and offers it back in the select', async () => {
    // A row re-typed from MENACE, or a restored revision, can carry role text
    // that is not one of the seven. Defaulting it would have written the
    // default over it on the first save — the exact thing the seedDraft
    // comment forbids. It is kept, and shown as a keep-option so the select
    // does not render blank while the draft still holds the value.
    const stored = 'Magical entity (Nearby)';
    renderSheet(discovery({ role: stored }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const select = screen.getByRole('combobox', { name: 'Kind' }) as HTMLSelectElement;
    expect(select.value).toBe(stored);
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toContain(stored);
    // Save without touching anything: `role` must not appear in the payload at
    // all, because the draft still holds the stored text and patch.ts omits
    // what did not change — the same, stronger form the MENACE legacy-role
    // test uses above. Before the fix, seedDraft replaced the text with the
    // default, so this very save carried `role: 'arcanum'` over it.
    // Save without touching anything: the sheet must not write the row AT ALL.
    // patch.ts sends only what changed, and nothing did — the draft still holds
    // the stored text. Before the fix seedDraft replaced it with the default,
    // so the draft differed from the row, a write fired, and `role: 'arcanum'`
    // landed on top of the stored string. So "no call" is the discriminator.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy());
    expect(updateCharacter).not.toHaveBeenCalled();
  });

  it('files an unfiled discovery on the next save, rather than leaving it blank', () => {
    // The consequence of dropping the Unfiled option, pinned deliberately: if
    // the draft were NOT seeded, the select would display "Arcanum" while
    // `role` stayed '' and the save would leave it unfiled — the display lie
    // this sheet forbids itself.
    renderSheet(discovery({ role: '', name: 'A bronze plate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.role).toBe('arcanum');
  });

  it('labels the traits section Requirements and shows it even when empty', () => {
    renderSheet(discovery({ traits: [] }));
    expect(screen.getByText('Requirements')).toBeTruthy();
    expect(screen.queryByText('Traits')).toBeNull();
  });

  // Requirements exist to be ticked off as play satisfies them (the book's
  // arcanum example is a sequence of preconditions) — a label with no tick
  // affordance delivers the noun without the function. Tickable OUTSIDE
  // edit mode too: same "it's play, not a sheet edit" semantics as the
  // threat-portent and loyalty ticks elsewhere in this file, so the click
  // below saves immediately with no Edit/Save round trip.
  it('keeps a requirement tickable, reflecting stored state, and saves the flip immediately', async () => {
    renderSheet(discovery());
    const done = screen.getByRole('button', { name: 'dig it up & clean it' });
    const pending = screen.getByRole('button', { name: 'decipher the Maker-runes' });
    expect(done.getAttribute('aria-pressed')).toBe('true');
    expect(pending.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(pending);
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      traits: [
        { label: 'dig it up & clean it', checked: true },
        { label: 'decipher the Maker-runes', checked: true },
      ],
    }));
  });

  // Since Task 7 an arcanum (the shared `discovery` fixture's role)
  // legitimately shows a Tags row — see the reveal test above — so this test
  // is deliberately silent on Tags. It only pins the fields a discovery never
  // has a use for regardless of kind.
  it('offers none of the fields a discovery has no use for', () => {
    renderSheet(discovery()); // roleMock.isGm is true — the widest surface
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText('Instinct')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Monster' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Follower' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deceased' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disbanded' })).toBeNull();
    // GM only stays: that IS the discovery's lifecycle.
    expect(screen.getByRole('button', { name: 'GM only' })).toBeTruthy();
  });

  it('ignores a stat block a restored revision left on the row', () => {
    renderSheet(discovery({ statblock: emptyStatBlock(), kind: 'maker' }));
    // Tolerate and ignore: the row keeps its shape, the sheet says nothing.
    expect(screen.queryByText('Stat block')).toBeNull();
  });

  // isMonster() now denies discovery monsterhood outright (lib/statblock),
  // but `monsterLive` in EDIT MODE reads `draft.kind` directly rather than
  // going through that predicate — a stale `kind` from a restored revision
  // still made `tagsLive` true and opened the Tags editor. Pinning the read
  // path (the test above) is not enough: this is the edit-mode branch.
  //
  // Explicitly `role: 'clue'` and NOT the shared fixture's `arcanum`: since
  // Task 7 an arcanum legitimately opens the Tags editor on its own, which
  // would make this test pass for the wrong reason. `clue` carries no game
  // elements (discoveryTagsLive stays false), so the stale monster `kind` is
  // the only door left that could swing this open.
  it('does not open the Tags editor for a discovery carrying a stale kind, in edit mode', () => {
    renderSheet(discovery({ role: 'clue', kind: 'maker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Tags')).toBeNull();
  });

  // Task 10: an artifact and an arcanum ARE cards in the book, so READING one
  // shows the card (ArcanumCard) where every other sheet shows a notes block.
  // ONE face: Phase 1 renders no mysteries, tracks or consequences, so the
  // card has no back at all (pinned in ArcanumCard.test.tsx; Task 15 adds the
  // panel together with its body). One is still the discriminating count here
  // — the sheet showing a notes block instead, or being in edit mode, both
  // give zero.
  it('prints an arcanum as the book`s card instead of a notes block', () => {
    const { container } = renderSheet(discovery());
    expect(container.querySelectorAll('[data-card-face]')).toHaveLength(1);
    expect(screen.queryByText('Description / Notes')).toBeNull();
  });

  // One editing model: the card is a read view, and edit mode is the ordinary
  // field stack — no inline-editing surface on a handout.
  it('goes back to the plain notes block in edit mode', () => {
    const { container } = renderSheet(discovery());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(container.querySelectorAll('[data-card-face]')).toHaveLength(0);
    expect(screen.getByText('Description / Notes')).toBeTruthy();
  });

  // A clue is a signifier, not an object: no card, no game elements.
  it('leaves the notes block alone for a kind that is not a card', () => {
    const { container } = renderSheet(discovery({ role: 'clue' }));
    expect(container.querySelectorAll('[data-card-face]')).toHaveLength(0);
    expect(screen.getByText('Description / Notes')).toBeTruthy();
  });
});

describe('leads', () => {
  // A SITE, not the shared `discovery` fixture's arcanum. Since Task 6 the
  // promoted relation is chosen by the discovery's KIND, and an arcanum
  // promotes `held-by` — a `leads-to` on one is inert, which would make every
  // case below pass or fail for the wrong reason. A site still promotes
  // `leads-to`, so these keep testing the lead plumbing itself. The
  // per-kind headings are covered in PromotedRelationsList.test.tsx.
  const site: Character = discovery({ role: 'site' });
  const lead = {
    id: 'r-1', space_id: 'space-1', from_character_id: 'd-1', to_character_id: 'c-2',
    relation_type: 'leads-to', gm_only: false, created_at: '2026-08-17T00:00:00Z',
  };

  it('lists a lead under "Leads to" on the discovery', () => {
    relationsMock.relations = [lead];
    renderSheet(site, undefined, [npc]);
    expect(screen.getByText('Leads to')).toBeTruthy();
    expect(screen.getByTitle('Elios')).toBeTruthy();
    // The `getByText('Leads to')` above only proves dedup by coincidence:
    // `character.leadsTo` (this section's heading) and `relation.leadsTo`
    // (the generic bond list's section label for a not-deduped relation)
    // happen to share the string 'Leads to' today. Renaming either key would
    // let this pass while the property silently stopped being tested. A
    // regex over titles catches BOTH of the generic list's possible formats
    // for this same relation — the sibling case below pins the target side
    // the same way with `getAllByTitle(/The bronze plate/)`.
    expect(screen.getAllByTitle(/Elios/)).toHaveLength(1);
  });

  it('lists the same row under "What leads here" on the target', () => {
    relationsMock.relations = [lead];
    renderSheet(npc, undefined, [site]);
    expect(screen.getByText('What leads here')).toBeTruthy();
    expect(screen.getByTitle('The bronze plate')).toBeTruthy();
    // The generic list must not ALSO show it — one row, one place per sheet.
    // Its heading is 'Bonds', not 'Relations': `character.relations` in en.ts
    // reads 'Bonds' (the component name kept the old word, the copy did not).
    expect(screen.queryByText('Bonds')).toBeTruthy();
    expect(screen.getAllByTitle(/The bronze plate/)).toHaveLength(1);
  });

  it('shows an inert leads-to as an ordinary bond', () => {
    // `from` is not a discovery, so it is not a lead. A site at the other end,
    // so the `from`-end rule is the ONLY reason it is inert.
    relationsMock.relations = [{ ...lead, from_character_id: 'c-2', to_character_id: 'd-1' }];
    renderSheet(site, undefined, [npc]);
    expect(screen.queryByText('What leads here')).toBeNull();
    expect(screen.getByText('Leads nowhere yet.')).toBeTruthy();
    // It surfaces in the generic list instead, labelled.
    expect(screen.getByTitle(/Elios — Leads to/)).toBeTruthy();
  });
});

// Task 8's own brief pictures a `{ gm }` option on `renderSheet`, an `await
// userEvent...` API, and jest-dom's `.toBeInTheDocument()`; none of the three
// exist in this file (GM-ness is the module-level `roleMock.isGm`,
// `@testing-library/user-event` and `@testing-library/jest-dom` aren't
// dependencies here — every other test in this file drives inputs with
// `fireEvent` and asserts presence with `.toBeTruthy()`/`.toBeNull()`).
// Adapted to the harness that is actually here rather than adding a second one.
describe('discovery block fields', () => {
  it('offers the tier row on an arcanum', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'arcanum' }));
    enterEditMode();
    expect(screen.getByLabelText('Tier')).toBeTruthy();
  });

  it('offers no tier row on a clue', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'clue' }));
    enterEditMode();
    expect(screen.queryByLabelText('Tier')).toBeNull();
  });

  // Same crux as Task 7's Tags reveal (~line 920 above): gated on
  // draft.roleRest, not the stored role, so choosing "Arcanum" must show the
  // tier row before any save — the other cases above only pin the gate's
  // RESULT on a fixture whose stored role already matches, which would still
  // pass if the gate quietly read `character.role` instead.
  it('reveals the tier row the moment Arcanum is chosen, before any save', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'clue' }));
    enterEditMode();
    expect(screen.queryByLabelText('Tier')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'arcanum' } });
    expect(screen.getByLabelText('Tier')).toBeTruthy();
  });

  it('offers the interesting/useful pair on a clue to a GM', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'clue' }));
    enterEditMode();
    expect(screen.getByLabelText('Something interesting')).toBeTruthy();
    expect(screen.getByLabelText('Something useful')).toBeTruthy();
  });

  it('offers it to a player nowhere — the server strips it anyway', () => {
    roleMock.isGm = false;
    renderSheet(discovery({ role: 'clue' }));
    enterEditMode();
    expect(screen.queryByLabelText('Something interesting')).toBeNull();
  });

  it('does not offer the pair on a site — the book gives it none', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'site' }));
    enterEditMode();
    expect(screen.queryByLabelText('Something interesting')).toBeNull();
  });

  it('sends only the changed key, and sends the block as an object', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'arcanum', name: 'A half-buried plaque' }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'minor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    // Assert the block and the key SET separately. A whole-payload toEqual is
    // brittle for a reason unrelated to this feature: a GM's payload always
    // carries gm_notes, seeded `character.gm_notes ?? ''`, so a fixture with a
    // null gm_notes yields a spurious '' vs null diff. Don't chase that.
    expect(payload.discovery).toEqual({ tier: 'minor' });
    expect(Object.keys(payload)).toContain('discovery');
  });

  it('preserves a stored block when an unrelated field is edited', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'arcanum', discovery: { tier: 'major', interesting: 'x' } }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Red Scepter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    // patch.ts diffs the outgoing payload: an untouched block is not sent, so
    // nothing can overwrite it. Assert its ABSENCE, not the whole payload.
    // This IS the assertion that proves patch.ts needed no change for Task 8.
    expect(payload).not.toHaveProperty('discovery');
    expect(payload.name).toBe('Red Scepter');
  });

  it('normalises a legacy shape out of storage on save', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'arcanum', discovery: { tier: 'minor', hp: 6 } as never }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'major' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({ tier: 'major' }); // `hp` gone
  });

  // Task 9's moves editor, same crux as the tier row's gating test above:
  // gated on draft.roleRest, not the stored role, so switching to "Artifact"
  // reveals it before any save.
  it('reveals the moves editor the moment Artifact is chosen, before any save', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'clue' }));
    enterEditMode();
    expect(screen.queryByRole('button', { name: 'Add a move' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'artifact' } });
    expect(screen.getByRole('button', { name: 'Add a move' })).toBeTruthy();
  });

  // Task 15: the mysteries editor is arcanum-only — an artifact has no second
  // face to fill (its moves stay front matter, per ArcanumCard's own doc). An
  // artifact's own Moves editor above proves the sheet subsection itself
  // renders for both kinds; this pins that Mysteries specifically does not
  // follow it there.
  it('offers the mysteries editor for an arcanum but not an artifact', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'artifact' }));
    enterEditMode();
    // The Moves editor for this same artifact IS present — proves the
    // absence below is Mysteries' own gate, not the whole subsection missing.
    expect(screen.getByRole('button', { name: 'Add a move' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a mystery' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'arcanum' } });
    expect(screen.getByRole('button', { name: 'Add a mystery' })).toBeTruthy();
  });

  // The rider: Task 8's patchBlock delete-key / null-the-block path shipped
  // with no test on the text fields. Pinning it here, on `interesting`, since
  // it is a plain input (no <select> ceremony) and lives in the same
  // isDiscovery block / patchBlock closure moves shares.
  it('drops only the emptied field, keeping the block\'s other field', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'clue', discovery: { interesting: 'x', useful: 'y' } }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Something interesting'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({ useful: 'y' }); // `interesting` gone, `useful` kept
  });

  it('sends discovery: null once the last field is emptied', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'clue', discovery: { interesting: 'x' } }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Something interesting'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toBeNull();
  });

  // MovesEditor.test.tsx pins the component's own callbacks in isolation; these
  // two pin the SHEET's wiring around it — the same delete-key/null-the-block
  // branch as the pair above, but for `moves` (an array key, not a string).
  it('sends the block with a moves key once a move is added to an empty block', async () => {
    roleMock.isGm = true;
    // `discovery()`'s default role is 'arcanum' with no `discovery` key, so
    // the draft block starts null — this is the empty-block starting point.
    renderSheet(discovery());
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'Add a move' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({ moves: [{ name: '', text: '' }] });
  });

  it('sends discovery: null once the last remaining move is removed', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ discovery: { moves: [{ name: 'Inflame', text: 'When you…' }] } }));
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Inflame 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toBeNull();
  });

  // FINAL REVIEW, finding 1, the OTHER half of the rule. The card's back is now
  // arcanum-only, matching the two editors — but the orphaned keys are
  // deliberately NOT normalised away. This drives the exact reproduction path
  // in reverse: an artifact whose stored block still carries mysteries shows no
  // back and no mysteries editor (which is what made the old back unreachable),
  // and re-typing it to arcanum finds the stored entry intact. Standing
  // tolerate-the-stored-shape rule; the card simply stops DRAWING it.
  it('hides an artifact`s stored mysteries but keeps them for a re-type to arcanum', () => {
    roleMock.isGm = true;
    renderSheet(discovery({
      role: 'artifact',
      discovery: {
        mysteries: [{ name: 'Burning Hatred', text: 'When you…' }],
        consequences: [{ label: 'Your skin becomes feverish', checked: false }],
      },
    }));
    // Read mode: an artifact draws ONE face whatever its block holds.
    expect(screen.queryByText(/Mysteries of/)).toBeNull();
    enterEditMode();
    // No editor reaches the stored mysteries while the row is an artifact —
    // the premise of the finding.
    expect(screen.queryByDisplayValue('Burning Hatred')).toBeNull();
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'arcanum' } });
    // …and they are still there the moment the kind comes back.
    expect(screen.getByDisplayValue('Burning Hatred')).toBeTruthy();
    expect(screen.getByText('Your skin becomes feverish')).toBeTruthy();
  });

  // Task 14: PipTrack's editor half. Beside Moves, same shape (a shape editor
  // that only sets the SHAPE — label, max — not the state), same delete-key/
  // null-the-block wiring as the pair above.
  it('reveals the tracks editor beside Moves, in edit mode', () => {
    roleMock.isGm = true;
    renderSheet(discovery());
    enterEditMode();
    expect(screen.getByRole('button', { name: 'Add a move' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a track' })).toBeTruthy();
  });

  it('sends the block with a tracks key once a track is added to an empty block', async () => {
    roleMock.isGm = true;
    renderSheet(discovery());
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'Add a track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({ tracks: [{ label: '', max: 0, marked: 0 }] });
  });

  it('sends discovery: null once the last remaining track is removed', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ discovery: { tracks: [{ label: 'Charges', max: 3, marked: 1 }] } }));
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Charges' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toBeNull();
  });

  // The editor sets the SHAPE, not just whether a row exists: relabelling and
  // resizing an existing track must round-trip through Save, `marked` (the
  // STATE) left untouched since this editor never offers it.
  it('edits an existing track\'s label and max, keeping its marked value', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ discovery: { tracks: [{ label: 'Charges', max: 3, marked: 2 }] } }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Track label 1'), { target: { value: 'Progress' } });
    fireEvent.change(screen.getByLabelText('Track max 1'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({ tracks: [{ label: 'Progress', max: 4, marked: 2 }] });
  });

  // A negative max is nonsensical for a pip row; `min={0}` on the input is a
  // browser-only hint (jsdom's `fireEvent.change` bypasses it), so the clamp
  // has to live in the handler itself.
  it('clamps a negative max to 0', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({ discovery: { tracks: [{ label: 'Charges', max: 3, marked: 0 }] } }));
    enterEditMode();
    fireEvent.change(screen.getByLabelText('Track max 1'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({ tracks: [{ label: 'Charges', max: 0, marked: 0 }] });
  });

  // The read-mode half: marking a pip is play, not editing (the card says
  // "you may erase 1 charge"), so it saves immediately with NO Edit/Save round
  // trip — same crux as the requirement tick test above, for the sibling
  // component that lives on the card instead of the identity chip row.
  it('marking a track pip on the read-mode card saves immediately', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({
      role: 'arcanum',
      discovery: { tier: 'minor', tracks: [{ label: 'Charges', max: 3, marked: 0 }] },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Charges 2' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: { tier: 'minor', tracks: [{ label: 'Charges', max: 3, marked: 2 }] },
    }));
  });

  // The book's erase rule, exercised through the whole sheet rather than
  // PipTrack in isolation: clicking the last FILLED pip patches `marked` DOWN.
  it('erasing the last-filled pip on the read-mode card also saves immediately', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({
      role: 'arcanum',
      discovery: { tier: 'minor', tracks: [{ label: 'Charges', max: 3, marked: 2 }] },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Charges 2' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: { tier: 'minor', tracks: [{ label: 'Charges', max: 3, marked: 1 }] },
    }));
  });

  // Two tracks — the Red Scepter's own shape (charges AND progress).
  // Marking the SECOND one's pip must patch that row by its own
  // index and leave the first untouched; a `markTrack` that always wrote
  // index 0 would still pass every single-track test above.
  it('marking the second of two tracks leaves the first untouched', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({
      role: 'arcanum',
      discovery: {
        tier: 'minor',
        tracks: [
          { label: 'Charges', max: 3, marked: 1 },
          { label: 'Progress', max: 4, marked: 0 },
        ],
      },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Progress 2' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: {
        tier: 'minor',
        tracks: [
          { label: 'Charges', max: 3, marked: 1 },
          { label: 'Progress', max: 4, marked: 2 },
        ],
      },
    }));
  });

  // Task 16: consequences are a SEPARATE array from `traits`/requirements —
  // an arcanum has both requirements AND consequences — reusing the
  // requirements row's chip-and-input pattern verbatim. Arcanum only, same
  // existence condition as the mysteries editor above: an artifact has no
  // back face to exact a price from.
  it('offers the consequences editor for an arcanum but not an artifact', () => {
    roleMock.isGm = true;
    renderSheet(discovery({ role: 'artifact' }));
    enterEditMode();
    expect(screen.queryByLabelText('Consequences')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'arcanum' } });
    expect(screen.getByLabelText('Consequences')).toBeTruthy();
  });

  it('sends the block with a consequences key once one is added to an empty block', async () => {
    roleMock.isGm = true;
    // `discovery()`'s default role is 'arcanum' with no `discovery` key, so
    // the draft block starts null — this is the empty-block starting point.
    renderSheet(discovery());
    enterEditMode();
    const input = screen.getByLabelText('Consequences');
    fireEvent.change(input, { target: { value: 'Your skin becomes feverish' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toEqual({
      consequences: [{ label: 'Your skin becomes feverish', checked: false }],
    });
  });

  it('sends discovery: null once the last remaining consequence is removed', async () => {
    roleMock.isGm = true;
    renderSheet(discovery({
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: false }] },
    }));
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Your skin becomes feverish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledTimes(1));
    const [, payload] = updateCharacter.mock.calls[0];
    expect(payload.discovery).toBeNull();
  });

  // Same dedupe as `addTrait`, the requirements row this editor reuses
  // verbatim: two consequences sharing a label would also share a CheckBox's
  // accessible name on the card's back — exactly what "two consequences must
  // not share a name" forbids.
  it('does not add a second chip for a duplicate consequence label', () => {
    roleMock.isGm = true;
    renderSheet(discovery({
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: false }] },
    }));
    enterEditMode();
    const input = screen.getByLabelText('Consequences');
    fireEvent.change(input, { target: { value: 'Your skin becomes feverish' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getAllByRole('button', { name: 'Delete Your skin becomes feverish' })).toHaveLength(1);
  });

  // The read-mode half: ticking a consequence is play, not editing — the
  // arcanum exacts its price at the table — so it saves immediately with NO
  // Edit/Save round trip, the same contract as a requirement's tick and a
  // track's pip.
  //
  // This file's suite has neither `@testing-library/user-event` nor
  // jest-dom, and `renderSheet` takes no `{ gm }` option (the session's role
  // is already hard-coded 'gm' — see the harness note above `describe
  // ('discovery block fields', …)`); adapted to the harness actually here.
  it('ticks a consequence in READ mode and saves at once', async () => {
    renderSheet(discovery({
      role: 'arcanum',
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: false }] },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Your skin becomes feverish' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: true }] },
    }));
  });

  // `toggleConsequence`'s own `if (!canEdit) return` — untested until now.
  // Unlike a track's pip (disabled at the ArcanumCard level via PipTrack's
  // `readOnly`), a consequence's CheckBox has no such visual gate — it reuses
  // the requirements row's chip verbatim, which relies entirely on the
  // handler's own guard (same as `toggleTraitChecked`). So this is the ONE
  // place that guard is exercised at all.
  it('a viewer cannot tick a consequence — the handler`s own guard no-ops', () => {
    roleMock.canEdit = false;
    renderSheet(discovery({
      role: 'arcanum',
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: false }] },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Your skin becomes feverish' }));

    expect(updateCharacter).not.toHaveBeenCalled();
  });

  // The draft patch is what makes the tick visible AT ONCE: `updateCharacter`
  // is a resolved mock that never touches the store, so the ONLY path to the
  // button's own `aria-pressed` flipping before that promise settles is
  // `toggleConsequence` patching the draft synchronously (mirroring
  // `markTrack`). A version that only fired the network call would leave the
  // button reading stale here even though the payload assertion above still
  // passes.
  it('flips the checkbox`s own aria-pressed immediately, before the write resolves', () => {
    renderSheet(discovery({
      role: 'arcanum',
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: false }] },
    }));

    const box = screen.getByRole('button', { name: 'Your skin becomes feverish' });
    expect(box.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(box);
    expect(screen.getByRole('button', { name: 'Your skin becomes feverish' })
      .getAttribute('aria-pressed')).toBe('true');
  });

  // `!c.checked` and not a hard-coded `true`: an already-exacted consequence
  // must be untickable too (the book gives no rule against it, and the front
  // requirement's tick already allows the same reversal).
  it('unticks an already-checked consequence', async () => {
    renderSheet(discovery({
      role: 'arcanum',
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: true }] },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Your skin becomes feverish' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: { consequences: [{ label: 'Your skin becomes feverish', checked: false }] },
    }));
  });

  // The field-level patch: `toggleConsequence` must spread the REST of the
  // stored block (its `tier` here) rather than sending `consequences` alone —
  // `markTrack`'s own test above pins the same shape for tracks.
  it('ticking a consequence preserves the rest of the discovery block', async () => {
    renderSheet(discovery({
      role: 'arcanum',
      discovery: {
        tier: 'major',
        consequences: [{ label: 'Your skin becomes feverish', checked: false }],
      },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Your skin becomes feverish' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: {
        tier: 'major',
        consequences: [{ label: 'Your skin becomes feverish', checked: true }],
      },
    }));
  });

  // Two consequences — ticking the SECOND one must patch that row by its own
  // index and leave the first untouched, the same crux as the two-tracks test
  // above (a handler that always wrote index 0 would still pass every
  // single-consequence test).
  it('ticking the second of two consequences leaves the first untouched', async () => {
    renderSheet(discovery({
      role: 'arcanum',
      discovery: {
        consequences: [
          { label: 'Your skin becomes feverish', checked: false },
          { label: 'Your eyes change, glowing like fiery embers', checked: false },
        ],
      },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Your eyes change, glowing like fiery embers' }));

    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('d-1', {
      discovery: {
        consequences: [
          { label: 'Your skin becomes feverish', checked: false },
          { label: 'Your eyes change, glowing like fiery embers', checked: true },
        ],
      },
    }));
  });
});
