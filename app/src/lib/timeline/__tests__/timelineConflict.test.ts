import { describe, it, expect } from 'vitest';
import {
  TimelineConflictError,
  TimelineOccupiedError,
  toConflictEntry,
  timelineErrorFromRpc,
} from '@/lib/timeline/timelineConflict';
import { storedRev } from '@/lib/timeline/seasonEntry';

describe('storedRev', () => {
  it('reads rev from object entries, 0 otherwise', () => {
    expect(storedRev({ body: '<p>x</p>', rev: 3 })).toBe(3);
    expect(storedRev({ body: '<p>x</p>' })).toBe(0);
    expect(storedRev('<p>legacy string</p>')).toBe(0);
    expect(storedRev(undefined)).toBe(0);
  });
});

describe('toConflictEntry', () => {
  it('normalizes object, legacy string, and absent entries', () => {
    expect(toConflictEntry({ title: 'Ambush', body: '<p>a</p>', rev: 2 })).toEqual({
      title: 'Ambush',
      body: '<p>a</p>',
      rev: 2,
    });
    expect(toConflictEntry('<p>legacy</p>')).toEqual({ title: undefined, body: '<p>legacy</p>', rev: 0 });
    expect(toConflictEntry(null)).toEqual({ title: undefined, body: '', rev: 0 });
  });
});

describe('timelineErrorFromRpc', () => {
  it('maps a 40001 CONFLICT with jsonb detail to TimelineConflictError', () => {
    const err = timelineErrorFromRpc({
      code: '40001',
      message: 'CONFLICT',
      details: '{"title":"Ambush","body":"<p>a</p>","rev":1}',
    });
    expect(err).toBeInstanceOf(TimelineConflictError);
    expect((err as TimelineConflictError).theirs).toEqual({ title: 'Ambush', body: '<p>a</p>', rev: 1 });
  });

  it('tolerates a null / legacy-string / garbage detail', () => {
    const nullDetail = timelineErrorFromRpc({ code: '40001', message: 'CONFLICT', details: 'null' });
    expect((nullDetail as TimelineConflictError).theirs).toEqual({ title: undefined, body: '', rev: 0 });

    const legacy = timelineErrorFromRpc({ code: '40001', message: 'CONFLICT', details: '"<p>old</p>"' });
    expect((legacy as TimelineConflictError).theirs.body).toBe('<p>old</p>');

    const garbage = timelineErrorFromRpc({ code: '40001', message: 'CONFLICT', details: 'not json' });
    expect((garbage as TimelineConflictError).theirs).toEqual({ title: undefined, body: '', rev: 0 });
  });

  it('maps OCCUPIED and passes other errors through as Error', () => {
    expect(timelineErrorFromRpc({ code: 'P0001', message: 'OCCUPIED' })).toBeInstanceOf(TimelineOccupiedError);
    const generic = timelineErrorFromRpc({ code: '42501', message: 'FORBIDDEN' });
    expect(generic).toBeInstanceOf(Error);
    expect(generic.message).toBe('FORBIDDEN');
  });
});
