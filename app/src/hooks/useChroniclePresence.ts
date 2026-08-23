import { useCallback, useEffect, useRef, useState } from 'react';
import {
  subscribeEditingPresence,
  trackEditing,
  untrackEditing,
  type EditingPresence,
} from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import type { Season, TimelineStrand } from '@/types';

/**
 * Présence d'édition des Chroniques : qui d'autre écrit, et l'annonce de ce
 * tab quand l'éditeur plein écran est ouvert. Sans Supabase (mode local),
 * `peers` reste vide et `setEditing` est un no-op.
 */
export function useChroniclePresence(spaceId: string | undefined) {
  const role = useAppStore((s) => s.session?.role ?? 'player');
  const [peers, setPeers] = useState<EditingPresence[]>([]);
  // Signature de la dernière annonce : évite de re-tracker à chaque frappe.
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    const unsub = subscribeEditingPresence(spaceId, setPeers);
    return () => {
      unsub();
      setPeers([]);
    };
  }, [spaceId]);

  // Départ de page : toujours retirer l'annonce.
  useEffect(() => {
    if (!spaceId) return;
    return () => {
      lastRef.current = null;
      untrackEditing(spaceId);
    };
  }, [spaceId]);

  const setEditing = useCallback(
    (target: { year: number; season: Season; strand: TimelineStrand } | null) => {
      if (!spaceId) return;
      const sig = target ? `${target.strand}:${target.year}:${target.season}` : null;
      if (sig === lastRef.current) return;
      lastRef.current = sig;
      if (target) trackEditing(spaceId, { ...target, role });
      else untrackEditing(spaceId);
    },
    [spaceId, role],
  );

  return { peers, setEditing };
}
