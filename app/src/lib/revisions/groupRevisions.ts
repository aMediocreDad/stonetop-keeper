import type { RevisionEvent } from '@/types';

/**
 * A run of adjacent ledger events collapsed for display. `events` preserves
 * the original newest-first order; `newest`/`oldest` are just its ends,
 * named for what they supply — see `groupRevisionEvents` for why `oldest`
 * (not `newest`) is the revert target.
 */
export interface RevisionEventGroup {
  /** Stable React key — the newest event's id, which is unique per group. */
  key: string;
  newest: RevisionEvent;
  oldest: RevisionEvent;
  count: number;
  events: RevisionEvent[];
}

/**
 * A row-level shape safe to fold into a run: one row, and it's an UPDATE.
 * `?? []` guards the same looseness `describeRevision` guards against
 * (`event.rows ?? []`) -- the type says `rows` is always an array, but this
 * has been seen nullish at runtime, and grouping now runs upstream of that
 * existing guard.
 */
function isSoloUpdate(event: RevisionEvent): boolean {
  const rows = event.rows ?? [];
  return rows.length === 1 && rows[0].op === 'UPDATE';
}

/**
 * Whether `next` (older, since the list is newest-first) can extend the run
 * that currently ends at `tail`. Every condition in the spec is a strict
 * AND: one row on both sides, same table+row, same actor, both UPDATEs.
 * Any multi-row event, INSERT/DELETE, actor change, or different row breaks
 * the run — `tail` itself must also qualify, since a group's seed event can
 * be anything (a DELETE forms a valid group of one that nothing may join).
 */
function continuesRun(tail: RevisionEvent, next: RevisionEvent): boolean {
  if (!isSoloUpdate(tail) || !isSoloUpdate(next)) return false;
  if (tail.actor_role !== next.actor_role) return false;
  const a = tail.rows[0];
  const b = next.rows[0];
  return a.table_name === b.table_name && a.row_id === b.row_id;
}

/**
 * Collapses adjacent events (newest-first, as `useRevisions` returns them)
 * into display groups. Grouping only ever compares an incoming event to the
 * tail of the group currently being built, so two runs on the same row that
 * are separated by an unrelated event (a different row, a different actor,
 * a cascade) never merge across that gap — they stay as distinct groups on
 * either side of it.
 *
 * Pure and presentation-only: takes the same `RevisionEvent[]` the page
 * already has, computes nothing from the server, and does not decide what
 * to render — see `LedgerEventCard` for that.
 */
export function groupRevisionEvents(events: RevisionEvent[]): RevisionEventGroup[] {
  const groups: RevisionEventGroup[] = [];

  for (const event of events) {
    const current = groups[groups.length - 1];
    const tail = current?.events[current.events.length - 1];

    if (current && tail && continuesRun(tail, event)) {
      current.events.push(event);
      current.oldest = event;
      current.count += 1;
    } else {
      groups.push({
        key: event.event_id,
        newest: event,
        oldest: event,
        count: 1,
        events: [event],
      });
    }
  }

  return groups;
}
