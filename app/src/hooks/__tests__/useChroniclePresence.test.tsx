import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

import { useChroniclePresence } from '@/hooks/useChroniclePresence';

describe('useChroniclePresence (local mode)', () => {
  it('is inert without Supabase: empty peers, setEditing is a safe no-op', () => {
    const { result, unmount } = renderHook(() => useChroniclePresence('space-x'));
    expect(result.current.peers).toEqual([]);
    act(() => {
      result.current.setEditing({ year: 2, season: 'spring', strand: 'player' });
      result.current.setEditing(null);
    });
    expect(result.current.peers).toEqual([]);
    unmount();
  });
});
