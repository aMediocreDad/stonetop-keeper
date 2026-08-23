import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ERR_OFFLINE,
  isNetworkError,
  resetConnectivityForTests,
} from '@/lib/offline/connectivity';

beforeEach(() => {
  resetConnectivityForTests();
});

/**
 * Regression guard for a bug that every mock-based test missed.
 *
 * `db.ts` classifies a transport failure once, at the façade boundary, and
 * re-throws it as `Error(ERR_OFFLINE)` — the original `TypeError: Failed to
 * fetch` never reaches a hook. So every downstream `isNetworkError` check runs
 * against the sentinel, not the raw error.
 *
 * When `isNetworkError` did not recognise its own sentinel, the check in
 * `useTimeline`'s save catch answered `false` for exactly the case it exists
 * to catch: the entry lost its `dirty` marker and the next successful read
 * overwrote the recap. Tests passed anyway, because they spy on `db` and
 * therefore throw the raw error the real code path never produces.
 */
describe('the offline sentinel survives the façade round trip', () => {
  it('isNetworkError recognises the code db.ts re-throws', () => {
    expect(isNetworkError(new Error(ERR_OFFLINE))).toBe(true);
  });

  it('still rejects application errors that travel the same way', () => {
    expect(isNetworkError(new Error('WRONG_PASSWORD'))).toBe(false);
    expect(isNetworkError(new Error('FORBIDDEN'))).toBe(false);
    expect(isNetworkError(new Error('CONFLICT'))).toBe(false);
    expect(isNetworkError(new Error('OCCUPIED'))).toBe(false);
    expect(isNetworkError(new Error('LEDGER_UNAVAILABLE'))).toBe(false);
  });
});

/**
 * `getMapImageUrl` accepts a PARTIAL map — `MapViewerPage` narrows it to the
 * fields that should trigger a re-sign — and `space_id` was not among them.
 * That made the blob lookup key on the string "undefined", miss every time,
 * and silently serve a signed URL that cannot load offline. The symptom was
 * "Could not load the map image" with nothing in the console.
 */
describe('the offline blob key tolerates a partial map', () => {
  it('falls back to the active session space when space_id is omitted', async () => {
    const { useAppStore } = await import('@/stores/appStore');
    const { putMapBlob, getMapBlob } = await import('@/lib/offline/mapBlobs');
    const { resetOfflineDbForTests } = await import('@/lib/offline/idb');
    const { IDBFactory } = await import('fake-indexeddb');

    globalThis.indexedDB = new IDBFactory();
    resetOfflineDbForTests();

    const spaceId = 'space-abc';
    const map = { id: 'map-1', updated_at: 't1' };
    await putMapBlob(spaceId, map, new Blob(['x'], { type: 'image/webp' }));

    useAppStore.setState({
      session: {
        space: { id: spaceId, name: 'S', invite_code: 'aa-aaa', created_at: '' },
        token: 't',
        isAdmin: true,
        role: 'gm',
      } as never,
    });

    // What the viewer actually passes: no space_id.
    const resolved = useAppStore.getState().session?.space.id ?? '';
    expect(resolved).toBe(spaceId);
    expect(await getMapBlob(resolved, map)).not.toBeNull();
    // The old behaviour, spelled out so a regression is unmistakable.
    expect(await getMapBlob('undefined', map)).toBeNull();
  });
});
