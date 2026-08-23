import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  getMapBlob,
  putMapBlob,
  prefetchMaps,
  evictStaleBlobs,
  countSavedMaps,
  purgeSpaceBlobs,
  purgeAllBlobs,
  shouldPrefetch,
} from '@/lib/offline/mapBlobs';
import { resetOfflineDbForTests } from '@/lib/offline/idb';
import type { CampaignMap } from '@/types';

const SPACE = 'space-1';

function map(id: string, updatedAt = 't1', hasImage = true): CampaignMap {
  return {
    id,
    space_id: SPACE,
    name: id,
    image_path: hasImage ? `maps/${id}.webp` : null,
    gm_only: false,
    created_at: 't0',
    updated_at: updatedAt,
  } as CampaignMap;
}

const bytes = (s: string) => new Blob([s], { type: 'image/webp' });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
  // Default to a connection that permits prefetching.
  Object.defineProperty(navigator, 'connection', {
    value: undefined,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapBlobs — storage', () => {
  it('round-trips bytes keyed by space, map and updated_at', async () => {
    await putMapBlob(SPACE, map('m1'), bytes('one'));
    const got = await getMapBlob(SPACE, map('m1'));
    expect(got?.size).toBe(3);
    expect(got?.type).toBe('image/webp');
  });

  // The versioning that makes an in-place image replacement work: same
  // `image_path`, new `updated_at`, so the old bytes must not be served.
  it('misses when updated_at moves on', async () => {
    await putMapBlob(SPACE, map('m1', 't1'), bytes('old'));
    expect(await getMapBlob(SPACE, map('m1', 't2'))).toBeNull();
  });

  it('isolates spaces', async () => {
    await putMapBlob(SPACE, map('m1'), bytes('mine'));
    expect(await getMapBlob('space-2', map('m1'))).toBeNull();
  });
});

describe('mapBlobs — prefetch', () => {
  it('downloads only maps not already stored at the current version', async () => {
    await putMapBlob(SPACE, map('m1'), bytes('cached'));
    const maps = [map('m1'), map('m2'), map('m3')];
    const fetchBytes = vi.fn(async (m: CampaignMap) => bytes(m.id));

    await prefetchMaps(SPACE, maps, fetchBytes);

    expect(fetchBytes.mock.calls.map(([m]) => m.id).sort()).toEqual(['m2', 'm3']);
    expect((await getMapBlob(SPACE, map('m2')))?.size).toBe(2);
  });

  it('skips maps with no image at all', async () => {
    const fetchBytes = vi.fn(async (m: CampaignMap) => bytes(m.id));
    await prefetchMaps(SPACE, [map('m1', 't1', false)], fetchBytes);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  // One expired URL or deleted object should not cost the other maps their
  // offline copy.
  it('keeps going when one map fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchBytes = vi.fn(async (m: CampaignMap) => {
      if (m.id === 'm2') throw new Error('IMAGE_FETCH_404');
      return bytes(m.id);
    });

    await prefetchMaps(SPACE, [map('m1'), map('m2'), map('m3')], fetchBytes);

    expect(await getMapBlob(SPACE, map('m1'))).not.toBeNull();
    expect(await getMapBlob(SPACE, map('m2'))).toBeNull();
    expect(await getMapBlob(SPACE, map('m3'))).not.toBeNull();
  });

  it('never runs more than two downloads at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchBytes = vi.fn(async (m: CampaignMap) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return bytes(m.id);
    });

    await prefetchMaps(SPACE, ['a', 'b', 'c', 'd', 'e'].map((id) => map(id)), fetchBytes);

    expect(peak).toBeLessThanOrEqual(2);
    expect(fetchBytes).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['saveData', { saveData: true, effectiveType: '4g' }],
    ['2g', { saveData: false, effectiveType: '2g' }],
    ['slow-2g', { saveData: false, effectiveType: 'slow-2g' }],
  ])('does not sweep on %s', async (_label, connection) => {
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
    expect(shouldPrefetch()).toBe(false);

    const fetchBytes = vi.fn(async (m: CampaignMap) => bytes(m.id));
    await prefetchMaps(SPACE, [map('m1')], fetchBytes);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  // Firefox has no Network Information API and always swept; Chrome reports
  // "3g" readily on a perfectly usable connection, so gating on it made the
  // sweep silently never run in Chrome — indistinguishable from a broken
  // cache, and exactly how this shipped broken.
  it('DOES sweep on 3g — the tier is too common to treat as narrow', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false, effectiveType: '3g' },
      configurable: true,
    });
    expect(shouldPrefetch()).toBe(true);

    const fetchBytes = vi.fn(async (m: CampaignMap) => bytes(m.id));
    await prefetchMaps(SPACE, [map('m1')], fetchBytes);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('sweeps on 4g and when the API is absent', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false, effectiveType: '4g' },
      configurable: true,
    });
    expect(shouldPrefetch()).toBe(true);

    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
    expect(shouldPrefetch()).toBe(true);
  });
});

describe('mapBlobs — housekeeping', () => {
  it('evicts deleted maps and superseded versions', async () => {
    await putMapBlob(SPACE, map('keep', 't1'), bytes('keep'));
    await putMapBlob(SPACE, map('stale', 't1'), bytes('stale'));
    await putMapBlob(SPACE, map('gone', 't1'), bytes('gone'));

    await evictStaleBlobs(SPACE, [map('keep', 't1'), map('stale', 't2')]);

    expect(await getMapBlob(SPACE, map('keep', 't1'))).not.toBeNull();
    expect(await getMapBlob(SPACE, map('stale', 't1'))).toBeNull();
    expect(await getMapBlob(SPACE, map('gone', 't1'))).toBeNull();
  });

  it('counts only maps that have an image and are stored', async () => {
    await putMapBlob(SPACE, map('m1'), bytes('a'));
    const maps = [map('m1'), map('m2'), map('m3', 't1', false)];
    expect(await countSavedMaps(SPACE, maps)).toBe(1);
  });

  it('purges one space, leaving others alone', async () => {
    await putMapBlob(SPACE, map('m1'), bytes('a'));
    await putMapBlob('space-2', map('m1'), bytes('b'));

    await purgeSpaceBlobs(SPACE);

    expect(await getMapBlob(SPACE, map('m1'))).toBeNull();
    expect(await getMapBlob('space-2', map('m1'))).not.toBeNull();
  });

  it('purges everything on sign-out', async () => {
    await putMapBlob(SPACE, map('m1'), bytes('a'));
    await putMapBlob('space-2', map('m2'), bytes('b'));

    await purgeAllBlobs();

    expect(await getMapBlob(SPACE, map('m1'))).toBeNull();
    expect(await getMapBlob('space-2', map('m2'))).toBeNull();
  });
});
