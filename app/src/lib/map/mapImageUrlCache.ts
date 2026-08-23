// =====================================================================
// In-memory cache of map-image URLs, keyed `${mapId}:${updated_at}` — signed
// URLs (~1h TTL) from the Edge Function, and object URLs minted over cached
// IndexedDB bytes.
//
// Its own module rather than a db.ts local because the store must be able to
// clear it on sign-out / leave / role change, and db.ts imports the store —
// importing back would be a cycle.
//
// Object URLs are what make this a real cache and not a memo: each one pins
// its multi-MB Blob in memory until `URL.revokeObjectURL` runs. Every path
// that drops an entry therefore revokes through these helpers — deleting a
// Map entry by hand leaks the Blob for the life of the tab.
// =====================================================================

export interface CachedMapUrl {
  url: string;
  expiresAt: number;
  objectUrl?: boolean;
}

const _cache = new Map<string, CachedMapUrl>();

export function getCachedMapUrl(key: string): CachedMapUrl | undefined {
  return _cache.get(key);
}

export function setCachedMapUrl(key: string, entry: CachedMapUrl): void {
  const prev = _cache.get(key);
  if (prev?.objectUrl && prev.url !== entry.url) URL.revokeObjectURL(prev.url);
  _cache.set(key, entry);
}

/**
 * Drops every entry for one map, whatever `updated_at` version it was cached
 * under. Prefix match because at deletion/replacement time the caller does not
 * necessarily know which version(s) were cached.
 */
export function invalidateMapImageCache(mapId: string): void {
  for (const [key, entry] of _cache) {
    if (!key.startsWith(`${mapId}:`)) continue;
    if (entry.objectUrl) URL.revokeObjectURL(entry.url);
    _cache.delete(key);
  }
}

/**
 * Everything. Keys carry no space id, so space-scoped purges (leave, role
 * change) over-purge to the whole cache — it is a URL memo, re-signing is one
 * Edge call, and a stale GM-only URL surviving a role downgrade is worse.
 */
export function clearMapImageUrlCache(): void {
  for (const entry of _cache.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.url);
  }
  _cache.clear();
}
