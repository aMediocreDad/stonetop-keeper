import { describe, expect, it } from 'vitest';
import { groupRevisionEvents } from '../groupRevisions';
import type { RevisionEvent, RevisionRow } from '@/types';

const row = (over: Partial<RevisionRow> = {}): RevisionRow => ({
  table_name: 'characters',
  row_id: 'r1',
  op: 'UPDATE',
  changed: ['notes'],
  label: 'Ereth',
  ...over,
});

const ev = (over: Partial<RevisionEvent> & { event_id: string }): RevisionEvent => ({
  at: '2026-07-25T18:00:00Z',
  actor_role: 'gm',
  last_id: 10,
  rows: [row()],
  ...over,
});

describe('groupRevisionEvents', () => {
  it('returns an empty array for an empty list', () => {
    expect(groupRevisionEvents([])).toEqual([]);
  });

  it('gives a single event a group of one, newest === oldest', () => {
    const e = ev({ event_id: 'e1' });
    const groups = groupRevisionEvents([e]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 1, newest: e, oldest: e, events: [e] });
  });

  it('collapses a run of same-row, same-actor updates, keeping the true newest and oldest', () => {
    // Newest-first, as the list arrives from the server.
    const e3 = ev({ event_id: 'e3', at: '2026-07-25T18:00:02Z' });
    const e2 = ev({ event_id: 'e2', at: '2026-07-25T18:00:01Z' });
    const e1 = ev({ event_id: 'e1', at: '2026-07-25T18:00:00Z' });

    const groups = groupRevisionEvents([e3, e2, e1]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].newest).toBe(e3);
    expect(groups[0].oldest).toBe(e1);
    expect(groups[0].events).toEqual([e3, e2, e1]);
  });

  it('breaks the run when the actor_role differs', () => {
    const gmEdit = ev({ event_id: 'e2', actor_role: 'gm' });
    const playerEdit = ev({ event_id: 'e1', actor_role: 'player' });

    const groups = groupRevisionEvents([gmEdit, playerEdit]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ count: 1, newest: gmEdit, oldest: gmEdit });
    expect(groups[1]).toMatchObject({ count: 1, newest: playerEdit, oldest: playerEdit });
  });

  it('breaks the run on a DELETE, even for the same row and actor', () => {
    const update = ev({ event_id: 'e2' });
    const del = ev({ event_id: 'e1', rows: [row({ op: 'DELETE', changed: [] })] });

    const groups = groupRevisionEvents([update, del]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
  });

  it('breaks the run on an INSERT, even for the same row and actor', () => {
    const update = ev({ event_id: 'e2' });
    const insert = ev({ event_id: 'e1', rows: [row({ op: 'INSERT', changed: [] })] });

    const groups = groupRevisionEvents([update, insert]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
  });

  it('never lets a multi-row event join a group, even one that flanks it on both sides with matching single-row updates', () => {
    const after = ev({ event_id: 'e3' });
    const cascade = ev({
      event_id: 'e2',
      rows: [row({ op: 'UPDATE' }), row({ table_name: 'relations', row_id: 'rel1', op: 'DELETE', changed: [], label: 'Ereth -> Bryn' })],
    });
    const before = ev({ event_id: 'e1' });

    const groups = groupRevisionEvents([after, cascade, before]);

    // The cascade event can never be swept into a neighbour's run, and its
    // own multi-row shape means it can never seed one either — every group
    // here is a singleton, even though the events either side of it are
    // otherwise identical solo updates to the same row by the same actor.
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.count)).toEqual([1, 1, 1]);
    expect(groups[1]).toMatchObject({ newest: cascade, oldest: cascade });
  });

  it('keeps two runs on the same row as two separate groups when a different row is edited in between', () => {
    const runBNewest = ev({ event_id: 'e4' });
    const runBOldest = ev({ event_id: 'e3' });
    const otherRow = ev({ event_id: 'e2', rows: [row({ row_id: 'r2' })] });
    const runAOldest = ev({ event_id: 'e1' });

    const groups = groupRevisionEvents([runBNewest, runBOldest, otherRow, runAOldest]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ count: 2, newest: runBNewest, oldest: runBOldest });
    expect(groups[1]).toMatchObject({ count: 1, newest: otherRow, oldest: otherRow });
    expect(groups[2]).toMatchObject({ count: 1, newest: runAOldest, oldest: runAOldest });
  });

  it('breaks the run when the table_name differs even if the row_id happens to match', () => {
    const charUpdate = ev({ event_id: 'e2', rows: [row({ table_name: 'characters', row_id: 'same-id' })] });
    const locUpdate = ev({ event_id: 'e1', rows: [row({ table_name: 'locations', row_id: 'same-id' })] });

    const groups = groupRevisionEvents([charUpdate, locUpdate]);

    expect(groups).toHaveLength(2);
  });
});
