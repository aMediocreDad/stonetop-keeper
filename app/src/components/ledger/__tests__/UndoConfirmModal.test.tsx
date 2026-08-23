import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { UndoConfirmModal } from '../UndoConfirmModal';
import { LanguageProvider } from '@/i18n';
import { en } from '@/i18n/en';
import type { UndoPlan } from '@/types';

// Rendered directly (not through LedgerPage): the modal is a small, mostly
// presentational component behind a `loadPlan`/`onConfirm` seam that's
// trivial to fake, and the distinction under test — per-row warning vs.
// group-level note, and which one wins — lives entirely in this component's
// own render logic. No env stubbing needed: UndoConfirmModal never touches
// `@/lib/db` or Supabase directly, only the injected `loadPlan`/`onConfirm`
// callbacks.
//
// The behaviour under test changed after review: suppressing the per-row
// "changed since" warning must be driven by the SERVER's `group_intact`
// (checked against LIVE state at preview time), never by the client's
// `groupCount` alone — a write from a player/another tab/another GM session
// can land in the window between the card rendering and the GM confirming,
// and `group_intact: false` is how the server reports that. `groupCount`
// still drives the (unconditional) group-level note, since that fact is
// true regardless of live state.

afterEach(() => cleanup());

const plan = (overrides: Partial<UndoPlan['rows'][number]> = {}): UndoPlan => ({
  event_id: 'e1',
  at: '2026-07-25T18:00:00Z',
  rows: [
    {
      table_name: 'characters',
      row_id: 'r1',
      action: 'restore',
      label: 'Ereth',
      changed_since: true,
      group_intact: null,
      unrestorable: false,
      reason: null,
      before: {},
      after: {},
      ...overrides,
    },
  ],
});

describe('UndoConfirmModal — group_intact-driven changed-since messaging', () => {
  it('a plain (non-grouped) event shows the per-row warning and no group note', async () => {
    const loadPlan = vi.fn().mockResolvedValue(plan());
    render(
      <LanguageProvider>
        <UndoConfirmModal
          eventId="e1"
          onClose={vi.fn()}
          loadPlan={loadPlan}
          onConfirm={vi.fn()}
        />
      </LanguageProvider>,
    );

    await screen.findByText('Ereth');

    expect(loadPlan).toHaveBeenCalledWith('e1', undefined);
    expect(screen.getByText(en.ledger.confirm.changedSince)).toBeTruthy();
    expect(screen.queryByText(/edits made in the same run/)).toBeNull();
  });

  it('a grouped revert forwards the expectation event to loadPlan, and suppresses the per-row warning only when the server confirms group_intact: true', async () => {
    const loadPlan = vi.fn().mockResolvedValue(plan({ group_intact: true }));
    render(
      <LanguageProvider>
        <UndoConfirmModal
          eventId="e1"
          groupCount={4}
          expectEventId="e4"
          onClose={vi.fn()}
          loadPlan={loadPlan}
          onConfirm={vi.fn()}
        />
      </LanguageProvider>,
    );

    await screen.findByText('Ereth');

    expect(loadPlan).toHaveBeenCalledWith('e1', 'e4');
    expect(screen.queryByText(en.ledger.confirm.changedSince)).toBeNull();
    const expected = en.ledger.confirm.groupNote.replace(/\{n\}/g, '4');
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('a grouped revert STILL shows the per-row warning when group_intact comes back false — an outside write landed, and the group note must not paper over it', async () => {
    const loadPlan = vi.fn().mockResolvedValue(plan({ group_intact: false }));
    render(
      <LanguageProvider>
        <UndoConfirmModal
          eventId="e1"
          groupCount={3}
          expectEventId="e3"
          onClose={vi.fn()}
          loadPlan={loadPlan}
          onConfirm={vi.fn()}
        />
      </LanguageProvider>,
    );

    await screen.findByText('Ereth');

    // The real conflict warning must fire...
    expect(screen.getByText(en.ledger.confirm.changedSince)).toBeTruthy();
    // ...alongside the group note, not instead of it — the group fact (3
    // edits, all targeted for revert) is still true even though this
    // particular row also picked up an outside write.
    const expected = en.ledger.confirm.groupNote.replace(/\{n\}/g, '3');
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('never shows the group note when the row is not actually changed_since, regardless of group_intact', async () => {
    const loadPlan = vi.fn().mockResolvedValue(plan({ changed_since: false, group_intact: true }));
    render(
      <LanguageProvider>
        <UndoConfirmModal
          eventId="e1"
          groupCount={2}
          expectEventId="e2"
          onClose={vi.fn()}
          loadPlan={loadPlan}
          onConfirm={vi.fn()}
        />
      </LanguageProvider>,
    );

    await screen.findByText('Ereth');

    // The group note is about framing the revert, not about `changed_since`
    // specifically — it still shows, since the group fact (2 edits, both of
    // which will be reverted) is true regardless of what this one row reports.
    const expected = en.ledger.confirm.groupNote.replace(/\{n\}/g, '2');
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.queryByText(en.ledger.confirm.changedSince)).toBeNull();
  });

  it('re-checks group_intact at confirm time and aborts the revert if it flipped to false while the dialog sat open', async () => {
    // First call is the initial preview on open (safe); second call is
    // submit()'s re-check, simulating an outside write landing in the
    // window while the GM was reading the dialog.
    const loadPlan = vi
      .fn()
      .mockResolvedValueOnce(plan({ group_intact: true }))
      .mockResolvedValueOnce(plan({ group_intact: false }));
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider>
        <UndoConfirmModal
          eventId="e1"
          groupCount={3}
          expectEventId="e3"
          onClose={vi.fn()}
          loadPlan={loadPlan}
          onConfirm={onConfirm}
        />
      </LanguageProvider>,
    );

    await screen.findByText('Ereth');
    // Confirms the premise: nothing warns yet, on the initial (still-safe) load.
    expect(screen.queryByText(en.ledger.confirm.changedSince)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /revert/i }));

    // The re-check's resolved (now-unsafe) plan must replace the stale one...
    await screen.findByText(en.ledger.confirm.changedSince);
    // ...and the revert itself must never have been asked for.
    expect(loadPlan).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not proceed with the revert, and does not get stuck busy, when the confirm-time re-check itself fails', async () => {
    const loadPlan = vi
      .fn()
      .mockResolvedValueOnce(plan({ group_intact: true }))
      .mockRejectedValueOnce(new Error('network blip'));
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider>
        <UndoConfirmModal
          eventId="e1"
          groupCount={2}
          expectEventId="e2"
          onClose={vi.fn()}
          loadPlan={loadPlan}
          onConfirm={onConfirm}
        />
      </LanguageProvider>,
    );

    await screen.findByText('Ereth');
    const revertButton = screen.getByRole('button', { name: /revert/i });
    fireEvent.click(revertButton);

    await waitFor(() => expect(loadPlan).toHaveBeenCalledTimes(2));
    expect(onConfirm).not.toHaveBeenCalled();
    // Busy must clear so the GM can retry or cancel, not be stuck forever.
    // No jest-dom matchers configured in this project's Vitest setup, so
    // this checks the native DOM property directly rather than `toBeDisabled()`.
    await waitFor(() => expect((revertButton as HTMLButtonElement).disabled).toBe(false));
  });
});
