import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/i18n';
import { ThreatSheetCard, type ThreatGmNotes } from '@/components/character/ThreatSheetCard';
import { emptyThreatSheet } from '@/lib/character/threatSheet';
import { useAppStore } from '@/stores/appStore';
import type { SpaceRole, SpaceSession, ThreatSheet } from '@/types';

// Tiptap est lourd/fragile en jsdom (voir ChronicleAnnals.test.tsx) : on le
// remplace par un simple textarea qui relaie `onChange` — la carte peut en
// monter deux (fatalité + notes MJ), d'où `getAllByTestId`.
vi.mock('@/components/shared/RichText', () => ({
  RichText: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
    <textarea data-testid="tiptap" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function renderCard(
  value: ThreatSheet,
  onChange: (t: ThreatSheet) => void,
  editable = true,
  gmNotes?: ThreatGmNotes,
) {
  return render(
    <LanguageProvider>
      <ThreatSheetCard value={value} onChange={onChange} editable={editable} gmNotes={gmNotes} />
    </LanguageProvider>,
  );
}

/** Session minimale pour piloter `useRole()` (même approche que dbRoles.test.ts). */
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

describe('ThreatSheetCard', () => {
  afterEach(() => {
    cleanup();
    // Sans session, useRole() retombe sur 'gm' — état de départ des autres tests.
    useAppStore.setState({ session: null });
  });

  it('renders the four section headings', () => {
    renderCard(emptyThreatSheet(), vi.fn());

    expect(screen.getByText('Grim portents')).toBeTruthy();
    expect(screen.getByText('Impending doom')).toBeTruthy();
    expect(screen.getByText('Stakes')).toBeTruthy();
    expect(screen.getByText('GM moves')).toBeTruthy();
  });

  it('adds a portent via the add-portent input and button', () => {
    const onChange = vi.fn();
    renderCard(emptyThreatSheet(), onChange);

    fireEvent.change(screen.getByPlaceholderText('Add portent'), {
      target: { value: 'The wells run dry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add portent' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        portents: [{ text: 'The wells run dry', done: false }],
      }),
    );
  });

  it('adds a stake via the add-stake input and button', () => {
    const onChange = vi.fn();
    renderCard(emptyThreatSheet(), onChange);

    fireEvent.change(screen.getByPlaceholderText('Add stake'), {
      target: { value: 'Who dies first?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add stake' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stakes: [{ text: 'Who dies first?', done: false }],
      }),
    );
  });

  it('ticks a stake as answered outside edit mode', () => {
    const onChange = vi.fn();
    renderCard(
      { ...emptyThreatSheet(), stakes: [{ text: 'Who dies first?', done: false }] },
      onChange,
      false,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Who dies first?' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stakes: [{ text: 'Who dies first?', done: true }],
      }),
    );
  });

  it('toggles the impending doom checkbox', () => {
    const onChange = vi.fn();
    renderCard(emptyThreatSheet(), onChange);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Impending doom' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        impendingDoom: { text: '', done: true },
      }),
    );
  });

  it('edits the impending doom through its rich-text editor', () => {
    const onChange = vi.fn();
    renderCard(emptyThreatSheet(), onChange);

    const [doomEditor] = screen.getAllByTestId('tiptap');
    fireEvent.change(doomEditor, { target: { value: '<p>Total eclipse</p>' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        impendingDoom: { text: '<p>Total eclipse</p>', done: false },
      }),
    );
  });

  it('hides every section in read mode when the sheet is empty', () => {
    renderCard(emptyThreatSheet(), vi.fn(), false);

    expect(screen.queryByText('Grim portents')).toBeNull();
    expect(screen.queryByText('Impending doom')).toBeNull();
    expect(screen.queryByText('Stakes')).toBeNull();
    expect(screen.queryByText('GM moves')).toBeNull();
  });

  it('shows only the sections that have content in read mode', () => {
    // `instinct` reste dans le type (compat révisions restaurées — voir
    // lib/threatSheet) mais n'est plus rendu par la carte : la page
    // personnage l'affiche désormais pour les quatre types (voir
    // CharacterSheetPage.test.tsx > instinct).
    const value: ThreatSheet = {
      instinct: 'consume all light',
      portents: [{ text: 'The wells run dry', done: true }],
      impendingDoom: { text: '', done: false },
      stakes: [],
      gmMoves: [],
    };
    renderCard(value, vi.fn(), false);

    expect(screen.getByText('Grim portents')).toBeTruthy();
    expect(screen.getByText('The wells run dry')).toBeTruthy();
    expect(screen.queryByText('Impending doom')).toBeNull();
    expect(screen.queryByText('Stakes')).toBeNull();
    expect(screen.queryByText('GM moves')).toBeNull();
  });

  it('shows the doom section in read mode when only its box is ticked', () => {
    const value: ThreatSheet = {
      ...emptyThreatSheet(),
      impendingDoom: { text: '', done: true },
    };
    renderCard(value, vi.fn(), false);

    expect(screen.getByText('Impending doom')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Impending doom' })).toBeTruthy();
    expect(screen.queryByText('Grim portents')).toBeNull();
  });

  it('renders the GM-notes section inside the card for a GM', () => {
    useAppStore.setState({ session: makeSession('gm') });
    renderCard(emptyThreatSheet(), vi.fn(), false, {
      value: '<p>secret</p>',
      onChange: vi.fn(),
    });

    expect(screen.getByText('GM notes')).toBeTruthy();
  });

  it('hides the GM-notes section from players', () => {
    useAppStore.setState({ session: makeSession('player') });
    renderCard(emptyThreatSheet(), vi.fn(), false, {
      value: '<p>secret</p>',
      onChange: vi.fn(),
    });

    expect(screen.queryByText('GM notes')).toBeNull();
  });

  it('does not let a viewer toggle checkboxes (server rejects all viewer writes)', () => {
    useAppStore.setState({ session: makeSession('viewer') });
    const onChange = vi.fn();
    const value: ThreatSheet = {
      ...emptyThreatSheet(),
      portents: [{ text: 'The wells run dry', done: false }],
      impendingDoom: { text: '<p>Total eclipse</p>', done: false },
    };
    renderCard(value, onChange, false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'The wells run dry' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Impending doom' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets a player toggle checkboxes outside edit mode (revealed-threat play)', () => {
    useAppStore.setState({ session: makeSession('player') });
    const onChange = vi.fn();
    const value: ThreatSheet = {
      ...emptyThreatSheet(),
      portents: [{ text: 'The wells run dry', done: false }],
    };
    renderCard(value, onChange, false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'The wells run dry' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        portents: [{ text: 'The wells run dry', done: true }],
      }),
    );
  });
});

describe('doom-anchored countdown', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState({ session: null });
  });

  it('renders the impending doom before the grim portents', () => {
    renderCard(
      {
        ...emptyThreatSheet(),
        portents: [{ text: 'The wells run dry', done: false }],
        impendingDoom: { text: '<p>Subjugation</p>', done: false },
      },
      vi.fn(),
    );
    const doom = screen.getByText('Impending doom');
    const portents = screen.getByText('Grim portents');
    expect(doom.compareDocumentPosition(portents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a done/total count next to the portents heading', () => {
    renderCard(
      {
        ...emptyThreatSheet(),
        portents: [
          { text: 'a', done: true },
          { text: 'b', done: false },
          { text: 'c', done: false },
        ],
      },
      vi.fn(),
    );
    expect(screen.getByText(/\(1\/3\)/)).toBeTruthy();
  });

  it('shows the "at hand" badge only when every portent is done and the doom is not', () => {
    renderCard(
      {
        ...emptyThreatSheet(),
        portents: [
          { text: 'a', done: true },
          { text: 'b', done: true },
        ],
        impendingDoom: { text: '<p>x</p>', done: false },
      },
      vi.fn(),
    );
    expect(screen.getByText('at hand')).toBeTruthy();
  });

  it('hides the badge when the doom is already done, when portents remain, and when there are none', () => {
    renderCard(
      {
        ...emptyThreatSheet(),
        portents: [{ text: 'a', done: true }],
        impendingDoom: { text: '<p>x</p>', done: true },
      },
      vi.fn(),
    );
    expect(screen.queryByText('at hand')).toBeNull();
    cleanup();
    renderCard(
      {
        ...emptyThreatSheet(),
        portents: [{ text: 'a', done: false }],
        impendingDoom: { text: '<p>x</p>', done: false },
      },
      vi.fn(),
    );
    expect(screen.queryByText('at hand')).toBeNull();
    cleanup();
    renderCard(
      {
        ...emptyThreatSheet(),
        portents: [],
        impendingDoom: { text: '<p>x</p>', done: false },
      },
      vi.fn(),
    );
    expect(screen.queryByText('at hand')).toBeNull();
  });
});
