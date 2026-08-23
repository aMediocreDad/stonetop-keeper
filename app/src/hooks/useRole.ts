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

/**
 * A viewer reads; a viewer does not carry the grimoire off.
 *
 * Same predicate as `useCanEdit`, deliberately not the same name: exporting is
 * not editing, and gating a download on "can edit" reads as a mistake at the
 * call site. Keeping them separate also lets one move without the other.
 *
 * Friction, not a wall: every read RPC is granted to `anon`, so a viewer
 * holding a token can still reassemble a vault by hand. This removes the
 * affordance — the product does not hand a guest an archive button.
 */
export function useCanExport(): boolean {
  return useRole() !== 'viewer';
}

/**
 * Whether to offer the `claude mcp add` one-liner. It embeds a live session
 * token, so offering it to a read-only visitor makes the campaign scriptable by
 * anyone who was given the invite code — on a `public_read` space, that is
 * anyone at all.
 *
 * The Worker itself does not yet reject viewer tokens: it cannot see the role,
 * because `app_session_from_token` and `app_space_from_token` are both revoked
 * from PUBLIC. That gate needs a new RPC and a migration; this is the UI half.
 */
export function useCanConnectLlm(): boolean {
  return useRole() !== 'viewer';
}
