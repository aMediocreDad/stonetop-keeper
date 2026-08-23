import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from '@/lib/mockDb';
import { TimelineConflictError, TimelineOccupiedError } from '@/lib/timeline/timelineConflict';

const SPACE = 'space-cas-test';

describe('localDb per-season CAS', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates the row and the entry at rev 1, deriving the marker', () => {
    const tl = localDb.saveTimelineEntry(SPACE, 2, 'spring', { title: 'Ambush', body: '<p>ford</p>' }, 0);
    expect(tl.entries['2'].spring).toEqual({ title: 'Ambush', body: '<p>ford</p>', rev: 1 });
    expect(tl.current_year).toBe(2);
    expect(tl.current_season).toBe('spring');
  });

  it('bumps rev on successive saves and keeps other seasons intact', () => {
    localDb.saveTimelineEntry(SPACE, 2, 'spring', { body: '<p>a</p>' }, 0);
    localDb.saveTimelineEntry(SPACE, 3, 'winter', { body: '<p>b</p>' }, 0);
    const tl = localDb.saveTimelineEntry(SPACE, 2, 'spring', { body: '<p>a2</p>' }, 1);
    expect(tl.entries['2'].spring).toMatchObject({ body: '<p>a2</p>', rev: 2 });
    expect(tl.entries['3'].winter).toMatchObject({ body: '<p>b</p>', rev: 1 });
    expect(tl.current_year).toBe(3);
    expect(tl.current_season).toBe('winter');
  });

  it('rejects a stale base rev with the current entry attached', () => {
    localDb.saveTimelineEntry(SPACE, 2, 'spring', { title: 'Theirs', body: '<p>theirs</p>' }, 0);
    let caught: unknown;
    try {
      localDb.saveTimelineEntry(SPACE, 2, 'spring', { body: '<p>mine</p>' }, 0);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TimelineConflictError);
    expect((caught as TimelineConflictError).theirs).toEqual({
      title: 'Theirs',
      body: '<p>theirs</p>',
      rev: 1,
    });
  });

  it('treats a legacy string entry as rev 0 and upgrades it on write', () => {
    localDb.saveTimeline(SPACE, {
      space_id: SPACE,
      entries: { '1': { summer: '<p>legacy</p>' } },
      current_year: 1,
      current_season: 'summer',
      updated_at: new Date().toISOString(),
    });
    const tl = localDb.saveTimelineEntry(SPACE, 1, 'summer', { body: '<p>upgraded</p>' }, 0);
    expect(tl.entries['1'].summer).toEqual({ body: '<p>upgraded</p>', rev: 1 });
  });

  it('gm strand: independent CAS, never moves the marker', () => {
    localDb.saveTimelineEntry(SPACE, 2, 'spring', { body: '<p>player</p>' }, 0);
    const tl = localDb.saveGmTimelineEntry(SPACE, 9, 'winter', { body: '<p>gm</p>' }, 0);
    expect(tl.gm_entries?.['9']?.winter).toEqual({ body: '<p>gm</p>', rev: 1 });
    expect(tl.current_year).toBe(2);
    expect(() => localDb.saveGmTimelineEntry(SPACE, 9, 'winter', { body: '<p>x</p>' }, 0)).toThrow(
      TimelineConflictError,
    );
  });

  it('moves an entry, bumping rev past both source and target, and re-derives the marker', () => {
    localDb.saveTimelineEntry(SPACE, 2, 'spring', { title: 'Ambush', body: '<p>ford</p>' }, 0);
    const tl = localDb.moveTimelineEntry(SPACE, { year: 2, season: 'spring' }, { year: 5, season: 'autumn' });
    expect(tl.entries['2']?.spring).toBeUndefined();
    expect(tl.entries['5'].autumn).toEqual({ title: 'Ambush', body: '<p>ford</p>', rev: 2 });
    expect(tl.current_year).toBe(5);
    expect(tl.current_season).toBe('autumn');
  });

  it('refuses to move onto an occupied season', () => {
    localDb.saveTimelineEntry(SPACE, 2, 'spring', { body: '<p>a</p>' }, 0);
    localDb.saveTimelineEntry(SPACE, 5, 'autumn', { body: '<p>b</p>' }, 0);
    expect(() =>
      localDb.moveTimelineEntry(SPACE, { year: 2, season: 'spring' }, { year: 5, season: 'autumn' }),
    ).toThrow(TimelineOccupiedError);
  });
});
