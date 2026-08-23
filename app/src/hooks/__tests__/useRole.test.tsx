import { describe, expect, it, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useAppStore } from '@/stores/appStore';
import { useCanConnectLlm, useCanEdit, useCanExport, useIsGm, useRole } from '../useRole';
import type { SpaceRole, SpaceSession } from '@/types';

// The capability hooks are the single owner of "what may this role do". Gating
// a feature on `role !== 'viewer'` inline at the call site is what let the
// export and Connect-LLM affordances drift open for viewers in the first place.

function sessionAt(role: SpaceRole): SpaceSession {
  return {
    space: {
      id: 's1',
      name: 'Example Campaign',
      invite_code: 'ab-cde',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    },
    token: 'tok-abc',
    isAdmin: role === 'gm',
    role,
  };
}

afterEach(() => cleanup());

describe('useRole capabilities', () => {
  it('denies a viewer both the export and the MCP connection', () => {
    useAppStore.setState({ session: sessionAt('viewer') });
    expect(renderHook(() => useCanExport()).result.current).toBe(false);
    expect(renderHook(() => useCanConnectLlm()).result.current).toBe(false);
  });

  it.each<SpaceRole>(['player', 'gm'])('grants both to a %s', (role) => {
    useAppStore.setState({ session: sessionAt(role) });
    expect(renderHook(() => useCanExport()).result.current).toBe(true);
    expect(renderHook(() => useCanConnectLlm()).result.current).toBe(true);
  });

  // The `?? 'gm'` fallback in useRole is what keeps the localStorage-only
  // instance usable: with no server session there is no role to be demoted by.
  it('grants both when there is no session at all (local fallback)', () => {
    useAppStore.setState({ session: null });
    expect(useAppStore.getState().session).toBeNull();
    expect(renderHook(() => useRole()).result.current).toBe('gm');
    expect(renderHook(() => useCanExport()).result.current).toBe(true);
    expect(renderHook(() => useCanConnectLlm()).result.current).toBe(true);
  });

  it('leaves the existing capabilities untouched', () => {
    useAppStore.setState({ session: sessionAt('player') });
    expect(renderHook(() => useCanEdit()).result.current).toBe(true);
    expect(renderHook(() => useIsGm()).result.current).toBe(false);
  });
});
