import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

vi.mock('@/components/shared/RichText', () => ({
  // Stub fidèle au contrat : en lecture (bannière de conflit), RichText rend
  // le HTML statiquement — le corps doit rester visible dans le test.
  RichText: ({ content, editable = true }: { content: string; editable?: boolean }) =>
    editable ? (
      <div data-testid="tiptap-stub" />
    ) : (
      <div data-testid="richtext-read" dangerouslySetInnerHTML={{ __html: content }} />
    ),
}));

import { LanguageProvider } from '@/i18n';
import { SeasonFocusModal } from '@/components/timeline/SeasonFocusModal';

describe('SeasonFocusModal conflict banner', () => {
  afterEach(() => cleanup());

  const renderModal = (onResolve = vi.fn()) => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <SeasonFocusModal
            season="spring"
            year={2}
            title=""
            body="<p>mine</p>"
            onChangeTitle={() => {}}
            onChangeBody={() => {}}
            onMove={() => true}
            onClose={() => {}}
            conflict={{ title: 'Ambush', body: '<p>their version of events</p>', rev: 2 }}
            onResolveConflict={onResolve}
          />
        </LanguageProvider>
      </MemoryRouter>,
    );
    return onResolve;
  };

  it('shows their version and both actions', () => {
    renderModal();
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Someone else wrote in this season');
    expect(banner.textContent).toContain('Ambush');
    // Chaîne absente des libellés de boutons : prouve le rendu du corps
    // assaini (dangerouslySetInnerHTML), pas seulement le texte du chrome.
    expect(banner.textContent).toContain('their version of events');
  });

  it('routes both resolutions with the strand', () => {
    const onResolve = renderModal();
    fireEvent.click(screen.getByText('Take theirs'));
    expect(onResolve).toHaveBeenCalledWith('player', 'theirs');
    fireEvent.click(screen.getByText('Keep mine'));
    expect(onResolve).toHaveBeenCalledWith('player', 'mine');
  });
});
