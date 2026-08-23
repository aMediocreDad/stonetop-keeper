import { useCallback } from 'react';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import type { SpaceSession } from '@/types';

export function useSpace() {
  const setSession = useAppStore((s) => s.setSession);

  // Creates a space WITHOUT setting the session yet — caller decides when to
  // enter. Returns the full session (space + server-issued token + isAdmin).
  const createSpace = useCallback(
    async (name: string, gmPassword: string, playerPassword?: string): Promise<SpaceSession> => {
      return db.createSpace(name, gmPassword, playerPassword);
    },
    [],
  );

  // Enter a space (set the session). Use after createSpace once the user
  // acknowledges the login code. The token comes from the server, NOT minted
  // in the browser — it is what authorises every subsequent read/write.
  const enterSpace = useCallback(
    (session: SpaceSession) => {
      setSession(session);
    },
    [setSession],
  );

  const joinSpace = useCallback(
    async (inviteCode: string, password: string) => {
      const session = await db.joinSpace(inviteCode, password);
      setSession(session);
      return session.space;
    },
    [setSession],
  );

  // Supprime un grimoire (cascade) après vérification du mot de passe.
  // Le caller est responsable de clear la session/router après succès.
  const deleteSpace = useCallback(
    async (spaceId: string, password: string) => {
      await db.deleteSpace(spaceId, password);
    },
    [],
  );

  // Réglages du grimoire (mots de passe MJ/joueur, lecture publique) — le
  // mot de passe MJ actuel doit être fourni pour toute modification.
  const updateSpaceSettings = useCallback(
    async (
      currentPassword: string,
      data: { gm_password?: string; player_password?: string; public_read?: boolean },
    ) => {
      await db.updateSpaceSettings(currentPassword, data);
    },
    [],
  );

  return { createSpace, enterSpace, joinSpace, deleteSpace, updateSpaceSettings };
}
