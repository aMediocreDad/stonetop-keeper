// =====================================================================
// Map image bytes in IndexedDB.
//
// The maps GRID needs nothing from this module — every row already carries a
// ~20 kB `thumb` data-URL. This is only about the full image, which is a
// multi-MB WebP behind a signed URL with a ~1h TTL, minted through an Edge
// Function. Offline you cannot mint one at all, and online you re-download on
// every reload; caching the bytes fixes both.
//
// Keyed by `updated_at` for the same reason `getMapImageUrl`'s in-memory cache
// is: replacing an image in place keeps `image_path`, so only the timestamp
// distinguishes new bytes from old.
// =====================================================================
import type { CampaignMap } from '@/types';
import { openOfflineDb } from './idb';

/** How many image downloads run at once during a prefetch sweep. */
const PREFETCH_CONCURRENCY = 2;

function keyOf(spaceId: string, map: Pick<CampaignMap, 'id' | 'updated_at'>): string {
  return `${spaceId}:${map.id}:${map.updated_at}`;
}

export async function getMapBlob(
  spaceId: string,
  map: Pick<CampaignMap, 'id' | 'updated_at'>,
): Promise<Blob | null> {
  try {
    const db = await openOfflineDb();
    const stored = await db.get('blobs', keyOf(spaceId, map));
    if (!stored?.buffer) return null;
    return new Blob([stored.buffer], { type: stored.type });
  } catch {
    return null;
  }
}

/**
 * Byte-free existence check. `getMapBlob` deserialises the entire multi-MB
 * ArrayBuffer through structured clone just to be discarded when the question
 * is only "is it there?" — reading the KEY answers it for free. Counting and
 * the prefetch pending-scan run 2×+ per realtime ping, so this is a hot path.
 */
export async function hasMapBlob(
  spaceId: string,
  map: Pick<CampaignMap, 'id' | 'updated_at'>,
): Promise<boolean> {
  try {
    const db = await openOfflineDb();
    return (await db.getKey('blobs', keyOf(spaceId, map))) !== undefined;
  } catch {
    return false;
  }
}

/** Returns whether the bytes were actually persisted. */
export async function putMapBlob(
  spaceId: string,
  map: Pick<CampaignMap, 'id' | 'updated_at'>,
  blob: Blob,
): Promise<boolean> {
  try {
    const db = await openOfflineDb();
    // See `StoredImage` in idb.ts for why this is an ArrayBuffer, not a Blob.
    await db.put(
      'blobs',
      { buffer: await blob.arrayBuffer(), type: blob.type },
      keyOf(spaceId, map),
    );
    return true;
  } catch (err) {
    // Reported, not swallowed. A quota rejection on a multi-MB map is the most
    // likely way for this cache to fail on a real campaign, and swallowing it
    // is indistinguishable from "the sweep never ran" — which cost a long time
    // to diagnose once already.
    console.error('[Maps] could not store map bytes offline', map.id, err);
    return false;
  }
}

/**
 * Whether an eager sweep is appropriate right now.
 *
 * Offline availability is a side effect of the instant-load design rather than
 * its goal, so spending tens of megabytes of someone's cellular allowance on
 * it silently is not a trade worth making.
 */
export function shouldPrefetch(): boolean {
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!conn) return true; // no Network Information API (Safari, Firefox) — proceed
  if (conn.saveData) {
    console.info('[Maps] offline prefetch skipped: Save-Data is on');
    return false;
  }
  // Only the genuinely narrow tiers. `effectiveType` is a rolling estimate and
  // Chrome reports "3g" readily on perfectly usable connections — gating on it
  // meant the sweep silently never ran, which looks identical to a broken
  // cache. Skipping is also no longer silent, for the same reason.
  if (['slow-2g', '2g'].includes(conn.effectiveType ?? '')) {
    console.info(`[Maps] offline prefetch skipped: connection is ${conn.effectiveType}`);
    return false;
  }
  return true;
}

/** How many of `maps` already have their bytes stored at the current version. */
export async function countSavedMaps(spaceId: string, maps: CampaignMap[]): Promise<number> {
  const withImages = maps.filter((m) => m.image_path);
  const flags = await Promise.all(withImages.map((m) => hasMapBlob(spaceId, m)));
  return flags.filter(Boolean).length;
}

/**
 * Downloads every not-yet-stored map image, a couple at a time.
 *
 * `fetchBytes` is injected rather than imported so this module stays free of
 * `db.ts` (which imports the connectivity module next door, and would make the
 * offline layer depend on the data layer it is supposed to sit beside).
 *
 * One map failing must not abandon the sweep — a single deleted object or
 * expired URL should not cost the other eight their offline copy.
 */
export async function prefetchMaps(
  spaceId: string,
  maps: CampaignMap[],
  fetchBytes: (map: CampaignMap) => Promise<Blob>,
): Promise<void> {
  if (!shouldPrefetch()) return;

  const pending: CampaignMap[] = [];
  for (const map of maps) {
    if (!map.image_path) continue;
    if (await hasMapBlob(spaceId, map)) continue;
    pending.push(map);
  }
  if (pending.length === 0) return;

  let cursor = 0;
  let stored = 0;
  let failed = 0;
  // "There is no backend to fetch from" is a configuration state, not a
  // failure: it is true for every map at once, so retrying the rest would only
  // produce one identical log line per map, on every render.
  let unavailable = false;
  const worker = async () => {
    while (cursor < pending.length && !unavailable) {
      const map = pending[cursor++];
      try {
        if (await putMapBlob(spaceId, map, await fetchBytes(map))) stored += 1;
        else failed += 1;
      } catch (err) {
        if ((err as { message?: string })?.message === 'NO_BACKEND') {
          unavailable = true;
          return;
        }
        failed += 1;
        console.error('[Maps] offline prefetch failed for', map.id, err);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, pending.length) }, worker),
  );

  if (unavailable) return;
  // One line per sweep that actually did something. Silence here previously
  // meant "working" and "never ran" looked exactly alike.
  console.info(
    `[Maps] offline prefetch: ${stored} saved, ${failed} failed, of ${pending.length} outstanding`,
  );
}

/** Drops bytes for maps that are gone, or superseded by a newer `updated_at`. */
export async function evictStaleBlobs(spaceId: string, maps: CampaignMap[]): Promise<void> {
  try {
    const db = await openOfflineDb();
    const live = new Set(maps.map((m) => keyOf(spaceId, m)));
    const prefix = `${spaceId}:`;
    const tx = db.transaction('blobs', 'readwrite');
    for (const key of await tx.store.getAllKeys()) {
      if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
      if (!live.has(key)) await tx.store.delete(key);
    }
    await tx.done;
  } catch {
    // Eviction is housekeeping; a failure just leaves bytes behind.
  }
}

/** Every map blob for a space. Called on sign-out, leave, and role change. */
export async function purgeSpaceBlobs(spaceId: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    const prefix = `${spaceId}:`;
    const tx = db.transaction('blobs', 'readwrite');
    for (const key of await tx.store.getAllKeys()) {
      if (typeof key === 'string' && key.startsWith(prefix)) await tx.store.delete(key);
    }
    await tx.done;
  } catch {
    // Ignored: a failed purge must never block signing out.
  }
}

/** Full sign-out. */
export async function purgeAllBlobs(): Promise<void> {
  try {
    const db = await openOfflineDb();
    await db.clear('blobs');
  } catch {
    // See purgeSpaceBlobs.
  }
}
