import { useCallback, useEffect, useRef, useState } from 'react';
import { db, subscribeSpace } from '@/lib/db';
import { useLoadStatus } from '@/hooks/useLoadStatus';
import type { RevisionEvent, UndoPlan, UndoResult } from '@/types';

const PAGE = 25;

/**
 * Le journal du MJ. Pagination keyset sur `last_id` (le plus grand
 * `revisions.id` de l'évènement) : un évènement n'est jamais coupé entre
 * deux pages. Un refetch complet suit chaque annulation et chaque ping
 * realtime — l'annulation est elle-même une écriture, donc elle apparaît
 * en tête du journal.
 */
export function useRevisions(spaceId: string | undefined) {
  const [events, setEvents] = useState<RevisionEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const { status, settle, reset } = useLoadStatus();
  // Évite qu'un refetch (realtime) et un loadMore se marchent dessus.
  const loading = useRef(false);
  // Un fetchFirst() demandé pendant qu'un autre tourne (ping realtime pendant
  // l'annulation, par ex.) ne doit jamais être perdu : on le note ici et la
  // boucle ci-dessous le rejoue une seule fois — jamais en chaîne — quand le
  // tour en cours se termine, succès ou échec confondus. Une boucle plutôt
  // qu'un rappel récursif à fetchFirst lui-même : le Compiler React ne peut
  // pas préserver la mémoïsation d'un useCallback qui se referme sur son
  // propre nom.
  const pending = useRef(false);

  const fetchFirst = useCallback(async () => {
    if (!spaceId) return;
    if (loading.current) {
      pending.current = true;
      return;
    }
    loading.current = true;
    try {
      do {
        pending.current = false;
        try {
          const page = await db.getRevisions(PAGE, undefined);
          setEvents(page);
          setHasMore(page.length === PAGE);
          settle(true);
        } catch (err) {
          console.error('[Ledger] fetch failed:', err);
          settle(false);
        }
      } while (pending.current);
    } finally {
      loading.current = false;
    }
  }, [spaceId, settle]);

  const loadMore = useCallback(async () => {
    if (!spaceId || loading.current) return;
    const cursor = events[events.length - 1]?.last_id;
    if (cursor === undefined) return;
    loading.current = true;
    try {
      const page = await db.getRevisions(PAGE, cursor);
      setEvents((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE);
    } catch (err) {
      console.error('[Ledger] page failed:', err);
    } finally {
      loading.current = false;
      // La garde est partagée avec fetchFirst : un refetch demandé (undo,
      // ping realtime) pendant que loadMore la tenait doit être rejoué ici
      // aussi, pas seulement quand c'est fetchFirst qui la tenait.
      if (pending.current) {
        pending.current = false;
        void fetchFirst();
      }
    }
  }, [spaceId, events, fetchFirst]);

  const retry = useCallback(() => {
    reset();
    void fetchFirst();
  }, [reset, fetchFirst]);

  // expectEventId: a grouped ledger card's newest event, passed through so
  // the server can compute group_intact against LIVE state at preview time
  // -- see db.previewUndoEvent and preview_undo_event's own comment.
  const preview = useCallback((eventId: string, expectEventId?: string): Promise<UndoPlan> => {
    return db.previewUndoEvent(eventId, expectEventId);
  }, []);

  const undo = useCallback(
    async (eventId: string): Promise<UndoResult> => {
      const result = await db.undoEvent(eventId);
      await fetchFirst();
      return result;
    },
    [fetchFirst],
  );

  useEffect(() => {
    if (!spaceId) return;
    void fetchFirst();
    return subscribeSpace(spaceId, () => void fetchFirst());
  }, [spaceId, fetchFirst]);

  return { events, status, hasMore, loadMore, retry, preview, undo };
}
