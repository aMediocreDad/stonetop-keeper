import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LedgerEventCard } from '../LedgerEventCard';
import { groupRevisionEvents, type RevisionEventGroup } from '@/lib/revisions/groupRevisions';
import { LanguageProvider } from '@/i18n';
import type { RevisionEvent, RevisionRow } from '@/types';

// This pins the single most safety-critical line in the grouping feature:
// clicking Revert must target the group's OLDEST event (restoring its
// `before` undoes the whole run in one call), never the newest -- and for a
// grouped card it must also pass the newest event along as the server-side
// expectation `group_intact` verifies against. describeRevision runs for
// real here (it's pure and only needs the headline, no mocking needed);
// LanguageProvider is required because the card calls useT().

afterEach(() => cleanup());

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

const renderCard = (
  group: RevisionEventGroup,
  onUndo: (eventId: string, groupCount: number, expectEventId?: string) => void,
) =>
  render(
    <LanguageProvider>
      <LedgerEventCard group={group} onUndo={onUndo} />
    </LanguageProvider>,
  );

describe('LedgerEventCard — Revert button wiring', () => {
  it('a single-event card (group of one) reverts that same event, with count 1 and no expectation', () => {
    const e = ev({ event_id: 'e1' });
    const [group] = groupRevisionEvents([e]);
    const onUndo = vi.fn();

    renderCard(group, onUndo);
    fireEvent.click(screen.getByRole('button', { name: /revert/i }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith('e1', 1, undefined);
  });

  it('a grouped card (run of 3) reverts the OLDEST event, carries the group count, and passes the NEWEST event as the expectation -- never the newest as the revert target', () => {
    // Newest-first, as the list arrives from the server.
    const e3 = ev({ event_id: 'e3', at: '2026-07-25T18:00:02Z' });
    const e2 = ev({ event_id: 'e2', at: '2026-07-25T18:00:01Z' });
    const e1 = ev({ event_id: 'e1', at: '2026-07-25T18:00:00Z' });
    const [group] = groupRevisionEvents([e3, e2, e1]);
    const onUndo = vi.fn();

    renderCard(group, onUndo);
    fireEvent.click(screen.getByRole('button', { name: /revert/i }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith('e1', 3, 'e3');
    // Restated explicitly: this must NOT be a call targeting e3 (the
    // newest) -- that would leave e2 and e1's edits standing, contradicting
    // what the collapsed card implies.
    expect(onUndo).not.toHaveBeenCalledWith('e3', expect.anything(), expect.anything());
  });
});
