// =====================================================================
// Collection snapshots in IndexedDB — the "instant load" half of the
// offline layer. Every read RPC returns a whole collection (there is no
// `updated_at > x` delta path), so the cache unit is a snapshot per
// collection, not a row set.
//
// This module is deliberately PURE with respect to app state: `spaceId` and
// `role` arrive as parameters and it imports neither `appStore` nor `db.ts`.
// That is load-bearing, not stylistic — `appStore` imports `purgeSpace`, so
// importing it back here would close an import cycle.
// =====================================================================
import type { SpaceRole } from '@/types';
import { openOfflineDb } from './idb';

/**
 * `mapPins:<mapId>` is per-map rather than one collection, because the RPC is
 * (`get_map_pins` takes a map id). Everything else is space-wide.
 */
export type Collection =
  | 'characters'
  | 'relations'
  | 'locations'
  | 'maps'
  | 'timeline'
  | 'gmJournal'
  | 'toneAndContent'
  | `mapPins:${string}`;

export interface Snapshot<T> {
  data: T;
  fetchedAt: number;
}

function keyOf(spaceId: string, role: SpaceRole, collection: Collection): string {
  return `${spaceId}:${role}:${collection}`;
}

/**
 * Cached collection, or `null` for a miss. Never rejects: a broken or
 * unavailable IndexedDB has to look like "nothing cached", or a storage
 * failure would take down the page load it was supposed to accelerate.
 */
export async function readSnapshot<T>(
  spaceId: string,
  role: SpaceRole,
  collection: Collection,
): Promise<T | null> {
  try {
    const db = await openOfflineDb();
    const hit = await db.get('snapshots', keyOf(spaceId, role, collection));
    // A record written by an older/incompatible version is a miss, not a crash.
    if (!hit || typeof hit !== 'object' || !('data' in hit)) return null;
    return hit.data as T;
  } catch {
    return null;
  }
}

/** Persists a freshly-fetched collection. Silent on failure (quota, private mode). */
export async function writeSnapshot<T>(
  spaceId: string,
  role: SpaceRole,
  collection: Collection,
  data: T,
): Promise<void> {
  try {
    const db = await openOfflineDb();
    await db.put(
      'snapshots',
      { data, fetchedAt: Date.now() },
      keyOf(spaceId, role, collection),
    );
  } catch {
    // Ignored on purpose: the cache is an optimisation, never a requirement.
  }
}

/**
 * Drops a space's snapshots. Without `role`, every role held for that space
 * goes — that is the sign-out / leave case. With `role`, only that role's, for
 * the re-join-with-a-different-password case.
 *
 * Map blobs are purged separately by `mapBlobs.purgeSpaceBlobs`; `appStore`
 * calls both.
 */
export async function purgeSpace(spaceId: string, role?: SpaceRole): Promise<void> {
  try {
    const db = await openOfflineDb();
    const prefix = role ? `${spaceId}:${role}:` : `${spaceId}:`;
    const tx = db.transaction('snapshots', 'readwrite');
    for (const key of await tx.store.getAllKeys()) {
      if (typeof key === 'string' && key.startsWith(prefix)) await tx.store.delete(key);
    }
    await tx.done;
  } catch {
    // Ignored: a failed purge must never block signing out.
  }
}

/** Full sign-out — every space, every role. */
export async function purgeAll(): Promise<void> {
  try {
    const db = await openOfflineDb();
    await db.clear('snapshots');
  } catch {
    // Ignored: see purgeSpace.
  }
}
