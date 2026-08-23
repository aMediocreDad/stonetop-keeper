import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { useAppStore } from '@/stores/appStore';
import { resetOfflineDbForTests } from '@/lib/offline/idb';
import { readSnapshot, writeSnapshot } from '@/lib/offline/snapshotCache';
import { getMapBlob, putMapBlob } from '@/lib/offline/mapBlobs';
import type { CampaignMap, SpaceRole, SpaceSession } from '@/types';

const SPACE = 'space-1';
const OTHER = 'space-2';

function session(spaceId: string, role: SpaceRole): SpaceSession {
  return {
    space: { id: spaceId, name: 'S', invite_code: 'aa-aaa', created_at: '' } as SpaceSession['space'],
    token: `t-${role}`,
    isAdmin: role === 'gm',
    role,
  };
}

const aMap = (spaceId: string) =>
  ({ id: 'm1', space_id: spaceId, updated_at: 't1' }) as CampaignMap;

/** Purges are fire-and-forget, so let their microtasks land. */
const flush = () => new Promise((r) => setTimeout(r, 10));

async function seed(spaceId: string, role: SpaceRole) {
  await writeSnapshot(spaceId, role, 'characters', [`${spaceId}-${role}`]);
  await putMapBlob(spaceId, aMap(spaceId), new Blob(['bytes']));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
  localStorage.clear();
  useAppStore.setState({ session: null, sessions: {} });
  vi.restoreAllMocks();
});

describe('appStore — cache purge', () => {
  it('clearSession drops every space, snapshots and blobs', async () => {
    await seed(SPACE, 'gm');
    await seed(OTHER, 'player');
    useAppStore.setState({ sessions: { [SPACE]: session(SPACE, 'gm') } });

    useAppStore.getState().clearSession();
    await flush();

    expect(await readSnapshot(SPACE, 'gm', 'characters')).toBeNull();
    expect(await readSnapshot(OTHER, 'player', 'characters')).toBeNull();
    expect(await getMapBlob(SPACE, aMap(SPACE))).toBeNull();
    expect(await getMapBlob(OTHER, aMap(OTHER))).toBeNull();
  });

  it('leaveSpace drops only that space', async () => {
    await seed(SPACE, 'gm');
    await seed(OTHER, 'gm');
    useAppStore.setState({
      session: session(SPACE, 'gm'),
      sessions: { [SPACE]: session(SPACE, 'gm'), [OTHER]: session(OTHER, 'gm') },
    });

    useAppStore.getState().leaveSpace(SPACE);
    await flush();

    expect(await readSnapshot(SPACE, 'gm', 'characters')).toBeNull();
    expect(await getMapBlob(SPACE, aMap(SPACE))).toBeNull();
    expect(await readSnapshot(OTHER, 'gm', 'characters')).toEqual([`${OTHER}-gm`]);
    expect(await getMapBlob(OTHER, aMap(OTHER))).not.toBeNull();
  });

  // The non-obvious trigger. Role comes from which password was used at join,
  // so a GM re-entering as a player produces a new session for a space we
  // already hold — and the GM's snapshots must not survive the downgrade.
  it('re-joining the same space with a different role purges the old role', async () => {
    await seed(SPACE, 'gm');
    useAppStore.getState().setSession(session(SPACE, 'gm'));

    useAppStore.getState().setSession(session(SPACE, 'player'));
    await flush();

    expect(await readSnapshot(SPACE, 'gm', 'characters')).toBeNull();
    expect(await getMapBlob(SPACE, aMap(SPACE))).toBeNull();
  });

  it('re-entering with the SAME role keeps the cache', async () => {
    useAppStore.getState().setSession(session(SPACE, 'gm'));
    await seed(SPACE, 'gm');

    useAppStore.getState().setSession(session(SPACE, 'gm'));
    await flush();

    expect(await readSnapshot(SPACE, 'gm', 'characters')).toEqual([`${SPACE}-gm`]);
    expect(await getMapBlob(SPACE, aMap(SPACE))).not.toBeNull();
  });

  it('entering a space for the first time purges nothing', async () => {
    await seed(OTHER, 'gm');

    useAppStore.getState().setSession(session(SPACE, 'gm'));
    await flush();

    expect(await readSnapshot(OTHER, 'gm', 'characters')).toEqual([`${OTHER}-gm`]);
  });

  // A broken IndexedDB must never be able to trap someone in a session.
  it('still signs out when the purge throws', async () => {
    resetOfflineDbForTests();
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    useAppStore.setState({ session: session(SPACE, 'gm'), sessions: { [SPACE]: session(SPACE, 'gm') } });

    expect(() => useAppStore.getState().clearSession()).not.toThrow();
    await flush();

    expect(useAppStore.getState().session).toBeNull();
    expect(useAppStore.getState().sessions).toEqual({});
  });
});
