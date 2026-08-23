import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localDb } from '@/lib/mockDb';
import { createDefaultSteading } from '@/lib/steading/steadingSeed';

beforeEach(() => localStorage.clear());

describe('localDb locations with sheet fields', () => {
  it('persists description/notes/tags/steading through create and update', () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'ABC123', password_hash: 'x' });
    const loc = localDb.createLocation({
      space_id: space.id,
      name: 'Stonetop',
      color: '#7AA177',
      description: 'A village',
      notes: '<p>hi</p>',
      tags: ['home'],
      steading: createDefaultSteading('en'),
      gm_only: false,
    });
    expect(loc.steading?.improvements).toHaveLength(17);

    const updated = localDb.updateLocation(loc.id, {
      steading: { ...loc.steading!, stats: { ...loc.steading!.stats, surplus: 4 } },
    });
    expect(updated.steading?.stats.surplus).toBe(4);
    expect(updated.description).toBe('A village'); // intact
    expect(localDb.getSpaceLocations(space.id)[0].steading?.stats.surplus).toBe(4);
  });
});

describe('localDb timeline season marker', () => {
  it('persists current_year/current_season', () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'ABC124', password_hash: 'x' });
    const saved = localDb.saveTimeline(space.id, {
      space_id: space.id,
      entries: {},
      current_year: 3,
      current_season: 'spring',
      updated_at: new Date().toISOString(),
    });
    expect(saved.current_year).toBe(3);
    expect(localDb.getTimeline(space.id)?.current_season).toBe('spring');
  });
});

describe('localDb tone & content', () => {
  afterEach(() => vi.useRealTimers());

  it('is absent until written, then merges by key presence', () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'TONE01', password_hash: 'x' });
    expect(localDb.getToneAndContent(space.id)).toBeNull();

    const first = localDb.saveToneAndContent(space.id, { notes: '<h2>Tone</h2>' });
    expect(first.notes).toBe('<h2>Tone</h2>');
    expect(first.space_id).toBe(space.id);

    // An absent key is a no-op — same contract as save_tone_and_content.
    const untouched = localDb.saveToneAndContent(space.id, {});
    expect(untouched.notes).toBe('<h2>Tone</h2>');
    expect(untouched.id).toBe(first.id); // still one row

    // An explicit empty string clears it.
    expect(localDb.saveToneAndContent(space.id, { notes: '' }).notes).toBe('');
  });

  it('is dropped with its space', () => {
    const space = localDb.createSpace({ name: 'S', invite_code: 'TONE02', password_hash: 'x' });
    localDb.saveToneAndContent(space.id, { notes: '<p>x</p>' });
    localDb.deleteSpace(space.id);
    expect(localDb.getToneAndContent(space.id)).toBeNull();
  });

  it('wakes cross-tab subscribers on a write, same as every other collection in the snapshot', () => {
    vi.useFakeTimers();
    const space = localDb.createSpace({ name: 'S', invite_code: 'TONE03', password_hash: 'x' });
    const cb = vi.fn();
    const unsubscribe = localDb.subscribe(space.id, cb);

    vi.advanceTimersByTime(1000); // first tick: establishes the baseline snapshot
    expect(cb).not.toHaveBeenCalled();

    localDb.saveToneAndContent(space.id, { notes: '<p>agreed</p>' });

    vi.advanceTimersByTime(1000); // second tick: snapshot now differs
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
