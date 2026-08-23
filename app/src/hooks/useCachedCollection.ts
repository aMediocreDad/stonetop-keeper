import { useCallback, useEffect, useRef } from 'react';
import { subscribeSpace } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { useLoadStatus } from '@/hooks/useLoadStatus';
import { readSnapshot, writeSnapshot, type Collection } from '@/lib/offline/snapshotCache';
import {
  isNetworkError,
  markNetworkFailure,
  markNetworkSuccess,
  subscribeConnectivity,
} from '@/lib/offline/connectivity';

interface Options<T> {
  spaceId: string | undefined;
  collection: Collection;
  /** The network read. Must be stable-ish; it is held in a ref, not a dep. */
  fetcher: () => Promise<T>;
  /**
   * Writes the data into the store. Supplied by the caller precisely so each
   * hook keeps its own pending-edit guard — `useTimeline` merges through
   * `mergeRemote(…, dirtyRef)`, `useLocations` re-applies `pendingSteading`.
   * Cache hydration is a THIRD write path into the store and would race those
   * guards if this module wrote to it directly.
   */
  merge: (data: T, source: 'cache' | 'network') => void;
  /**
   * Notified when a fetch rejects, so a caller can surface an application
   * error (a GM-only map answering NOT_FOUND, say) that is not just "offline".
   * The helper still handles the load status itself.
   */
  onError?: (err: unknown) => void;
}

/**
 * Cache-first read for one space-scoped collection: paint from the IndexedDB
 * snapshot immediately, then revalidate over the network and repaint quietly.
 *
 * Also owns the realtime subscription and the reconnect refetch, which every
 * consuming hook otherwise duplicates.
 */
export function useCachedCollection<T>({
  spaceId,
  collection,
  fetcher,
  merge,
  onError,
}: Options<T>) {
  const role = useAppStore((s) => s.session?.role ?? 'gm');
  const { status, source, settle, reset } = useLoadStatus();

  // Callers rebuild these every render; holding them in refs keeps the effect
  // from re-subscribing (and re-hydrating) on each parent render.
  const fetcherRef = useRef(fetcher);
  const mergeRef = useRef(merge);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    fetcherRef.current = fetcher;
    mergeRef.current = merge;
    onErrorRef.current = onError;
  });

  const mountedRef = useRef(true);
  // Set once the network answers, so a slow IndexedDB read can never repaint
  // stale content over fresh content.
  const networkLandedRef = useRef(false);
  // Whether this collection's most recent attempt failed. Gates the reconnect
  // refetch — see the subscription below for why that gate is load-bearing.
  const lastAttemptFailedRef = useRef(false);
  // Serialized payload of the last merge. Realtime pings are content-free, so
  // most refetches return exactly what the store already holds — and handing
  // the store a fresh-but-identical array gives every subscriber a new
  // identity: every sheet memo rebuilds, the graph tears down its renderer,
  // the maps hooks re-sweep IndexedDB. Equal payloads never reach merge.
  const lastPayloadRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!spaceId) return;
    try {
      const fresh = await fetcherRef.current();
      markNetworkSuccess();
      networkLandedRef.current = true;
      lastAttemptFailedRef.current = false;
      if (!mountedRef.current) return;
      const payload = JSON.stringify(fresh);
      if (payload !== lastPayloadRef.current) {
        lastPayloadRef.current = payload;
        mergeRef.current(fresh, 'network');
        // Written after the merge so a snapshot never exists for data the user
        // has not been shown. An unchanged payload skips the write too: the
        // snapshot holding it is what made the payload comparable at all.
        void writeSnapshot(spaceId, role, collection, fresh);
      }
      settle(true, 'network');
    } catch (err) {
      lastAttemptFailedRef.current = true;
      if (isNetworkError(err)) markNetworkFailure();
      console.error(`[${collection}] fetch failed:`, err);
      if (!mountedRef.current) return;
      onErrorRef.current?.(err);
      // `settle(false)` keeps `ready` if we already have something on screen —
      // cached or fresh. Only a first load with no snapshot reaches `error`.
      settle(false);
    }
  }, [spaceId, role, collection, settle]);

  const retry = useCallback(() => {
    reset();
    void refetch();
  }, [reset, refetch]);

  useEffect(() => {
    if (!spaceId) return;
    mountedRef.current = true;
    networkLandedRef.current = false;
    lastPayloadRef.current = null;

    // Both start now; they are not sequenced. Awaiting the snapshot first
    // would add IndexedDB latency to every network read, and awaiting the
    // network first would defeat the point.
    void refetch();
    void readSnapshot<T>(spaceId, role, collection).then((cached) => {
      if (cached === null || !mountedRef.current || networkLandedRef.current) return;
      lastPayloadRef.current = JSON.stringify(cached);
      mergeRef.current(cached, 'cache');
      settle(true, 'cache');
    });

    // Coalesced: the DB broadcasts one content-free ping per row change, so a
    // burst (a pin drag, a bulk edit) is N pings carrying one fact. A single
    // trailing refetch inside the window sees the final state; N refetches see
    // it N times. A ping landing while a refetch is in flight schedules a new
    // trailing one, so nothing is ever dropped.
    let pingTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubSpace = subscribeSpace(spaceId, () => {
      if (pingTimer !== null) return;
      pingTimer = setTimeout(() => {
        pingTimer = null;
        void refetch();
      }, 250);
    });
    // Reconnect: revalidate the moment the network is believed back — but only
    // if THIS collection's last attempt actually failed.
    //
    // The gate is not an optimisation. Without it, one collection whose reads
    // persistently fail and another whose reads succeed drive each other in a
    // loop: the failure marks offline, the success marks online, and every
    // transition makes both refetch. Measured at 11 subscribers ping-ponging
    // until the event loop starved. A collection whose last read succeeded
    // learns nothing from an online transition, so it stays put.
    const unsubNet = subscribeConnectivity((online) => {
      if (online && lastAttemptFailedRef.current) void refetch();
    });

    return () => {
      mountedRef.current = false;
      if (pingTimer !== null) clearTimeout(pingTimer);
      unsubSpace();
      unsubNet();
    };
  }, [spaceId, role, collection, refetch, settle]);

  return { status, source, refetch, retry };
}
