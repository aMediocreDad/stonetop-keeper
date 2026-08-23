import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedMapUrl,
  setCachedMapUrl,
  invalidateMapImageCache,
  clearMapImageUrlCache,
} from '@/lib/map/mapImageUrlCache';

// The contract under test is the revocation discipline: every path that drops
// an object-URL entry must revoke it, or the Blob it pins leaks for the life
// of the tab (the audit measured ~18 MB after viewing six maps).
const revoke = vi.fn();

beforeEach(() => {
  clearMapImageUrlCache();
  revoke.mockClear();
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: revoke });
});

describe('mapImageUrlCache', () => {
  it('stores and returns entries by key', () => {
    setCachedMapUrl('m1:t1', { url: 'https://signed', expiresAt: 123 });
    expect(getCachedMapUrl('m1:t1')).toEqual({ url: 'https://signed', expiresAt: 123 });
    expect(getCachedMapUrl('m1:t2')).toBeUndefined();
  });

  it('revokes a replaced object URL', () => {
    setCachedMapUrl('m1:t1', { url: 'blob:old', expiresAt: Infinity, objectUrl: true });
    setCachedMapUrl('m1:t1', { url: 'blob:new', expiresAt: Infinity, objectUrl: true });
    expect(revoke).toHaveBeenCalledWith('blob:old');
    expect(getCachedMapUrl('m1:t1')?.url).toBe('blob:new');
  });

  it('does not revoke when a signed URL replaces a signed URL', () => {
    setCachedMapUrl('m1:t1', { url: 'https://a', expiresAt: 1 });
    setCachedMapUrl('m1:t1', { url: 'https://b', expiresAt: 2 });
    expect(revoke).not.toHaveBeenCalled();
  });

  // Image replacement keeps `image_path` but bumps `updated_at`, so the stale
  // version lives under a key nobody will ever read again — prefix
  // invalidation is what reclaims it.
  it('invalidates every version of one map, revoking its object URLs', () => {
    setCachedMapUrl('m1:t1', { url: 'blob:v1', expiresAt: Infinity, objectUrl: true });
    setCachedMapUrl('m1:t2', { url: 'https://v2', expiresAt: 99 });
    setCachedMapUrl('m2:t1', { url: 'blob:other', expiresAt: Infinity, objectUrl: true });

    invalidateMapImageCache('m1');

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:v1');
    expect(getCachedMapUrl('m1:t1')).toBeUndefined();
    expect(getCachedMapUrl('m1:t2')).toBeUndefined();
    expect(getCachedMapUrl('m2:t1')).toBeDefined();
  });

  it('clear revokes every object URL and empties the cache', () => {
    setCachedMapUrl('m1:t1', { url: 'blob:a', expiresAt: Infinity, objectUrl: true });
    setCachedMapUrl('m2:t1', { url: 'blob:b', expiresAt: Infinity, objectUrl: true });
    setCachedMapUrl('m3:t1', { url: 'https://c', expiresAt: 1 });

    clearMapImageUrlCache();

    expect(revoke).toHaveBeenCalledTimes(2);
    expect(getCachedMapUrl('m1:t1')).toBeUndefined();
    expect(getCachedMapUrl('m3:t1')).toBeUndefined();
  });
});
