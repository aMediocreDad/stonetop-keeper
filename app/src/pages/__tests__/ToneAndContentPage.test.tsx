import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

const roleMock = vi.hoisted(() => ({ canEdit: true }));
vi.mock('@/hooks/useRole', () => ({
  useCanEdit: () => roleMock.canEdit,
  useIsGm: () => false,
  useRole: () => (roleMock.canEdit ? 'player' : 'viewer'),
}));
const richTextMock = vi.hoisted(() => ({ editable: undefined as boolean | undefined }));
vi.mock('@/components/shared/RichText', () => ({
  RichText: ({ editable }: { editable: boolean }) => {
    richTextMock.editable = editable;
    return <div data-testid="richtext" />;
  },
}));
const tacMock = vi.hoisted(() => ({ notes: '<p>x</p>', loaded: true }));
vi.mock('@/hooks/useToneAndContent', () => ({
  useToneAndContent: () => ({
    record: { id: 't1', space_id: 's1', notes: tacMock.notes, updated_at: '' },
    loaded: tacMock.loaded,
    updateNotes: vi.fn(),
  }),
}));
// The page builds its @-mention list from these two; stub them so the suite
// never touches the db layer.
vi.mock('@/hooks/useCharacters', () => ({ useCharacters: () => ({ characters: [] }) }));
vi.mock('@/hooks/useLocations', () => ({ useLocations: () => ({ locations: [] }) }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));

import ToneAndContentPage from '@/pages/ToneAndContentPage';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter><ToneAndContentPage /></MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  cleanup();
  richTextMock.editable = undefined;
  roleMock.canEdit = true;
  tacMock.notes = '<p>x</p>';
  tacMock.loaded = true;
  useAppStore.setState({
    session: {
      space: { id: 's1', name: 'S', invite_code: 'ABC', created_at: '', updated_at: '' },
      isAdmin: false, token: 't', role: 'player',
    },
  });
});

describe('ToneAndContentPage', () => {
  it('shows the CATS prompt and lets a player edit', () => {
    renderPage();
    expect(screen.getByText(/Concept · Aim · Tone · Subject matter/)).toBeTruthy();
    expect(screen.getByTestId('richtext')).toBeTruthy();
    expect(richTextMock.editable).toBe(false); // read mode until Edit is pressed
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(richTextMock.editable).toBe(true);
  });

  it('gives a viewer no way in, but a readable page', () => {
    roleMock.canEdit = false;
    renderPage();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(richTextMock.editable).toBe(false);
    // A viewer must still get the boundaries the table agreed on, not a
    // blank screen: the CATS hint and the read-only notice both render.
    expect(screen.getByText(/Concept · Aim · Tone · Subject matter/)).toBeTruthy();
    expect(screen.getByText(/reading as a viewer/i)).toBeTruthy();
  });

  it('shows the empty prompt instead of the editor once loaded with nothing written', () => {
    tacMock.notes = '';
    tacMock.loaded = true;
    renderPage();
    expect(screen.getByText(/Nothing agreed here yet/)).toBeTruthy();
    expect(screen.queryByTestId('richtext')).toBeNull();
  });

  it('does not flash the empty prompt while the record is still loading', () => {
    tacMock.notes = '';
    tacMock.loaded = false;
    renderPage();
    expect(screen.queryByText(/Nothing agreed here yet/)).toBeNull();
    expect(screen.getByTestId('richtext')).toBeTruthy();
  });

  it('still shows the empty prompt for an emptied doc (Tiptap never emits "")', () => {
    // A cleared ProseMirror doc serializes to `<p></p>`, not `''` — truthy as
    // a string, empty as text. The gate must strip markup, not just check
    // for a falsy string, or a table that clears the page after writing it
    // once gets a blank box instead of the empty prompt.
    tacMock.notes = '<p></p>';
    tacMock.loaded = true;
    renderPage();
    expect(screen.getByText(/Nothing agreed here yet/)).toBeTruthy();
    expect(screen.queryByTestId('richtext')).toBeNull();
  });
});
