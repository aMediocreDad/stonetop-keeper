import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  readSnapshot,
  writeSnapshot,
  purgeSpace,
  purgeAll,
} from '@/lib/offline/snapshotCache';
import { resetOfflineDbForTests } from '@/lib/offline/idb';

// Every case starts from a clean database: fake-indexeddb persists state
// across tests otherwise, and `idb.ts`'s singleton would hold the old handle.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetOfflineDbForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('snapshotCache', () => {
  it('round-trips a collection snapshot', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', [{ id: 'a', name: 'Arvid' }]);
    const read = await readSnapshot<{ id: string; name: string }[]>(
      'space-1', 'gm', 'characters',
    );
    expect(read).toEqual([{ id: 'a', name: 'Arvid' }]);
  });

  it('returns null on a miss', async () => {
    expect(await readSnapshot('space-1', 'gm', 'characters')).toBeNull();
  });

  // The whole point of the role-keyed cache: reads are role-filtered
  // server-side, so a space-only key would expose the GM layer to whoever
  // joins next as a player on the same device.
  it('isolates snapshots by role for the same space and collection', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', ['gm-only-npc']);
    await writeSnapshot('space-1', 'player', 'characters', ['public-npc']);

    expect(await readSnapshot('space-1', 'gm', 'characters')).toEqual(['gm-only-npc']);
    expect(await readSnapshot('space-1', 'player', 'characters')).toEqual(['public-npc']);
  });

  it('isolates snapshots by space', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', ['one']);
    await writeSnapshot('space-2', 'gm', 'characters', ['two']);

    expect(await readSnapshot('space-1', 'gm', 'characters')).toEqual(['one']);
    expect(await readSnapshot('space-2', 'gm', 'characters')).toEqual(['two']);
  });

  it('purgeSpace without a role drops every role held for that space', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', ['a']);
    await writeSnapshot('space-1', 'player', 'characters', ['b']);
    await writeSnapshot('space-2', 'gm', 'characters', ['keep']);

    await purgeSpace('space-1');

    expect(await readSnapshot('space-1', 'gm', 'characters')).toBeNull();
    expect(await readSnapshot('space-1', 'player', 'characters')).toBeNull();
    expect(await readSnapshot('space-2', 'gm', 'characters')).toEqual(['keep']);
  });

  it('purgeSpace with a role drops only that role', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', ['a']);
    await writeSnapshot('space-1', 'player', 'characters', ['b']);

    await purgeSpace('space-1', 'gm');

    expect(await readSnapshot('space-1', 'gm', 'characters')).toBeNull();
    expect(await readSnapshot('space-1', 'player', 'characters')).toEqual(['b']);
  });

  // A naive prefix match would treat "space-10" as a child of "space-1".
  it('purgeSpace does not drop a space whose id merely starts the same', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', ['a']);
    await writeSnapshot('space-10', 'gm', 'characters', ['keep']);

    await purgeSpace('space-1');

    expect(await readSnapshot('space-10', 'gm', 'characters')).toEqual(['keep']);
  });

  it('purgeAll empties every space', async () => {
    await writeSnapshot('space-1', 'gm', 'characters', ['a']);
    await writeSnapshot('space-2', 'player', 'locations', ['b']);

    await purgeAll();

    expect(await readSnapshot('space-1', 'gm', 'characters')).toBeNull();
    expect(await readSnapshot('space-2', 'player', 'locations')).toBeNull();
  });

  // The cache is an optimisation: a broken IndexedDB must look like "nothing
  // cached", never take down the page load it was supposed to accelerate.
  it('degrades to a miss when IndexedDB is unavailable', async () => {
    resetOfflineDbForTests();
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(await readSnapshot('space-1', 'gm', 'characters')).toBeNull();
    await expect(writeSnapshot('space-1', 'gm', 'characters', ['a'])).resolves.toBeUndefined();
    await expect(purgeSpace('space-1')).resolves.toBeUndefined();
    await expect(purgeAll()).resolves.toBeUndefined();
  });
});
