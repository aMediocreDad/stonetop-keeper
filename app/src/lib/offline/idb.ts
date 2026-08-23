// =====================================================================
// IndexedDB handle for the offline cache. Opening and upgrading only —
// no read/write policy lives here (see `snapshotCache.ts`, `mapBlobs.ts`).
//
// Two stores, deliberately separate:
//   - `snapshots`  collection JSON, keyed `${spaceId}:${role}:${collection}`
//   - `blobs`      map image bytes, keyed `${spaceId}:${mapId}:${updatedAt}`
//
// Snapshots are role-keyed because reads are role-filtered server-side: a
// space-only key would surface a GM's plum layer to whoever joins next as a
// player on the same device.
// =====================================================================
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

const DB_NAME = 'inkstone-offline';
const DB_VERSION = 1;

/**
 * Image bytes are stored as a raw `ArrayBuffer` plus its MIME type rather than
 * as a `Blob`. Storing Blobs directly is legal but has a long history of
 * engine-specific breakage (notably WebKit), and an ArrayBuffer is the one
 * representation every structured-clone implementation handles identically.
 * `mapBlobs.ts` reconstitutes the Blob on read.
 */
export interface StoredImage {
  buffer: ArrayBuffer;
  type: string;
}

export interface OfflineSchema extends DBSchema {
  snapshots: { key: string; value: { data: unknown; fetchedAt: number } };
  blobs: { key: string; value: StoredImage };
}

let _db: Promise<IDBPDatabase<OfflineSchema>> | null = null;

/**
 * Lazy singleton. Rejects only if IndexedDB itself is unavailable (private
 * browsing, disabled storage) — every caller treats that as "no cache" rather
 * than an error, so the app degrades to today's network-only behaviour.
 */
const STORES = ['snapshots', 'blobs'] as const;

function createMissingStores(db: IDBPDatabase<OfflineSchema>): void {
  for (const name of STORES) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
  }
}

export function openOfflineDb(): Promise<IDBPDatabase<OfflineSchema>> {
  if (_db) return _db;
  _db = (async () => {
    let db = await openDB<OfflineSchema>(DB_NAME, DB_VERSION, { upgrade: createMissingStores });

    // A database can exist at the current version WITHOUT our stores — anything
    // that called `indexedDB.open(name)` with no version created an empty one
    // first, and `upgrade` only runs when the version actually changes. Left
    // alone that is unrecoverable: every read misses and every write throws,
    // silently, forever. Reopen one version up to force the upgrade.
    const missing = STORES.filter((s) => !db.objectStoreNames.contains(s));
    if (missing.length > 0) {
      const version = db.version + 1;
      db.close();
      db = await openDB<OfflineSchema>(DB_NAME, version, { upgrade: createMissingStores });
    }
    return db;
  })();
  // A rejected open must not poison the singleton forever: drop it so a later
  // call can retry (e.g. quota freed, permission granted).
  _db.catch(() => {
    _db = null;
  });
  return _db;
}

/** Drops the cached handle. Tests only — each case wants a fresh database. */
export function resetOfflineDbForTests(): void {
  _db = null;
}
