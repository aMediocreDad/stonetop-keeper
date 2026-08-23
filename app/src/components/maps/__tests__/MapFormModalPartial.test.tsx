import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

vi.mock('@/hooks/useRole', () => ({ useIsGm: () => true, useCanEdit: () => true }));
vi.mock('@/components/locations/LocationPicker', () => ({ LocationPicker: () => null }));

const updateMap = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/hooks/useMaps', () => ({
  useMapsData: () => ({ createMap: vi.fn(), updateMap, uploadImage: vi.fn() }),
}));

import { MapFormModal } from '@/components/maps/MapFormModal';
import { LanguageProvider } from '@/i18n';
import type { CampaignMap } from '@/types';

const map: CampaignMap = {
  id: 'm-1', space_id: 'space-1', name: 'The Vale', description: 'the low road',
  location_id: null, gm_only: false, thumb: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
};

function renderModal(target: CampaignMap = map) {
  return render(
    <LanguageProvider>
      <MapFormModal spaceId="space-1" map={target} onClose={() => {}} />
    </LanguageProvider>,
  );
}

afterEach(() => cleanup());
beforeEach(() => updateMap.mockClear());

describe('MapFormModal — partial saves', () => {
  it('sends only the renamed field', async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue('The Vale'), { target: { value: 'The High Vale' } });
    fireEvent.submit(screen.getByDisplayValue('The High Vale').closest('form')!);

    await waitFor(() => expect(updateMap).toHaveBeenCalled());
    const sent = updateMap.mock.calls[0][1];
    expect(sent.name).toBe('The High Vale');
    // Untouched columns must not be rewritten — a GM flipping gm_only while
    // someone else renames the map should not lose the flag.
    expect(Object.keys(sent)).not.toContain('description');
    expect(Object.keys(sent)).not.toContain('gm_only');
    expect(Object.keys(sent)).not.toContain('location_id');
  });

  it('does not call the RPC when nothing changed', async () => {
    renderModal();
    fireEvent.submit(screen.getByDisplayValue('The Vale').closest('form')!);
    await waitFor(() => expect(updateMap).not.toHaveBeenCalled());
  });
});
