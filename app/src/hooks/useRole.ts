import { useAppStore } from '@/stores/appStore';
import type { SpaceRole } from '@/types';

/** Rôle de la session active. 'gm' par défaut (fallback local / legacy). */
export function useRole(): SpaceRole {
  return useAppStore((s) => s.session?.role ?? 'gm');
}

export function useCanEdit(): boolean {
  return useRole() !== 'viewer';
}

export function useIsGm(): boolean {
  return useRole() === 'gm';
}
