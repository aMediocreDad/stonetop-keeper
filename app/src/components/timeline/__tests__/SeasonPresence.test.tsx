import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { LanguageProvider } from '@/i18n';
import { SeasonField } from '@/components/timeline/SeasonField';

const renderField = (peer?: { year: number; season: 'spring'; strand: 'player' | 'gm'; role: 'gm' | 'player' }) =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <SeasonField
          season="spring"
          value={{ body: '<p>text</p>' }}
          onOpen={() => {}}
          peerEditing={peer}
        />
      </LanguageProvider>
    </MemoryRouter>,
  );

describe('SeasonField presence', () => {
  afterEach(() => cleanup());

  it('shows nothing without a peer', () => {
    renderField(undefined);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('labels a GM peer and a player peer differently', () => {
    renderField({ year: 2, season: 'spring', strand: 'gm', role: 'gm' });
    expect(screen.getByRole('status').textContent).toContain('The GM is writing here');
    cleanup();
    renderField({ year: 2, season: 'spring', strand: 'player', role: 'player' });
    expect(screen.getByRole('status').textContent).toContain('Another player is writing here');
  });
});
