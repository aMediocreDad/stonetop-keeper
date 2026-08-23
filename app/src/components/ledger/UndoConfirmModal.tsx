import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useT, type TKey } from '@/i18n';
import type { UndoPlan } from '@/types';

interface Props {
  eventId: string | null;
  /** Size of the ledger-card group this event was reverted from. Defaults
   * to 1 (a plain, non-grouped event) so single-event callers are unaffected.
   * Only drives the group-level `groupNote` line below -- it is NOT what
   * decides whether the per-row warning is suppressed (see `group_intact`). */
  groupCount?: number;
  /** The group's newest event, passed only for a grouped revert (groupCount
   * > 1). Forwarded to `loadPlan` so the server can compute `group_intact`
   * against LIVE state at preview time -- see LedgerEventCard's onUndo. */
  expectEventId?: string;
  onClose: () => void;
  loadPlan: (eventId: string, expectEventId?: string) => Promise<UndoPlan>;
  onConfirm: (eventId: string) => Promise<void>;
}

// Server `reason` codes (see db/11_revisions.sql) translated so none of them
// ever prints raw to a GM — a database enum has no place in a hand-crafted
// campaign journal. `constraint_<sqlstate>` carries a variable suffix and
// any other unrecognised code falls back to `ledger.reason.generic`.
const REASON_KEY: Record<string, TKey> = {
  character_missing: 'ledger.reason.characterMissing',
  map_missing: 'ledger.reason.mapMissing',
  location_missing: 'ledger.reason.locationMissing',
  exists: 'ledger.reason.exists',
  row_missing: 'ledger.reason.rowMissing',
  already_gone: 'ledger.reason.alreadyGone',
};

function reasonText(reason: string | null, t: ReturnType<typeof useT>): string {
  const key = reason ? REASON_KEY[reason] : undefined;
  return t(key ?? 'ledger.reason.generic');
}

/**
 * Le garde-fou de l'annulation « ligne entière » : on montre ce qui va
 * changer AVANT de l'écrire — y compris les lignes modifiées depuis
 * (qu'on va écraser) et celles qui ne peuvent pas revenir.
 */
export function UndoConfirmModal({
  eventId,
  groupCount = 1,
  expectEventId,
  onClose,
  loadPlan,
  onConfirm,
}: Props) {
  const t = useT();
  const [plan, setPlan] = useState<UndoPlan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) {
      // Resets the preview when the modal closes (eventId -> null); same
      // pattern used elsewhere in this codebase (see JoinSpaceModal, useMaps).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlan(null);
      return;
    }
    let alive = true;
    loadPlan(eventId, expectEventId)
      .then((p) => {
        if (alive) setPlan(p);
      })
      .catch((err) => {
        console.error('[Ledger] preview failed:', err);
        if (alive) onClose();
      });
    return () => {
      alive = false;
    };
  }, [eventId, expectEventId, loadPlan, onClose]);

  const submit = async () => {
    if (!eventId) return;
    setBusy(true);
    try {
      // Re-check right before writing, not just on open: `plan` above was
      // fetched when the dialog first appeared, and the GM may then sit on
      // it for a while before confirming. For a grouped revert, `group_intact`
      // is exactly the signal that can flip in that window -- a player,
      // another tab, or another GM session writing to this row while the
      // dialog sat open. Re-fetching here, immediately before the write,
      // closes that window; checking only at open-time (what this dialog
      // did before this fix) only ever moves the window earlier, it never
      // shrinks it.
      const fresh = await loadPlan(eventId, expectEventId);
      setPlan(fresh);
      if (fresh.rows.some((r) => r.group_intact === false)) {
        // Something outside the run touched the row since the dialog
        // opened. Do NOT silently proceed on the stale, safe-looking
        // preview -- `fresh` (just written to state above) already carries
        // the real warning, so the GM sees it and can decide again, the
        // same way the ordinary changed_since warning already lets them
        // choose to proceed with full knowledge rather than being silently
        // overridden either way.
        return;
      }
      await onConfirm(eventId);
      onClose();
    } catch (err) {
      // A failed re-check must never fall through to onConfirm -- proceeding
      // on a preview we could not actually verify would defeat the entire
      // point of re-checking. Logged and left for the GM to retry or cancel;
      // `finally` below still clears `busy` either way.
      console.error('[Ledger] re-check before revert failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const hasMap = plan?.rows.some((r) => r.table_name === 'maps' && r.action === 're-insert');

  return (
    <Modal
      open={Boolean(eventId)}
      onClose={onClose}
      labelledBy="undo-title"
      role="alertdialog"
      size="lg"
      dismissible={!busy}
    >
      <h2 id="undo-title" className="font-display text-2xl text-[var(--text-primary)] mb-2">
        {t('ledger.confirm.title')}
      </h2>
      <p className="font-body text-sm text-[var(--text-secondary)] mb-5">
        {t('ledger.confirm.intro')}
      </p>

      {/* Grouped revert: `oldest`'s row will, by construction, look
          "changed since" against every other member of the run -- true
          regardless of what actually happened live, since it is measured
          against the run's OLDEST event and the run's own later member
          edits guarantee a difference. One quiet line says so, once, in
          place of a per-row alarm that would otherwise fire on every
          grouped card. Shown purely off the client-computed `groupCount` --
          unlike the per-row warning below, this line does not depend on the
          server's `group_intact` and is never wrong to show. */}
      {groupCount > 1 && (
        <p className="font-body text-sm text-[var(--text-secondary)] mb-5">
          {t('ledger.confirm.groupNote', { n: groupCount })}
        </p>
      )}

      {!plan ? (
        <p className="font-body text-sm text-[var(--text-muted)]" aria-busy="true">
          {t('common.loading')}
        </p>
      ) : (
        <ul className="space-y-2 mb-6">
          {plan.rows.map((r, i) => (
            <li
              // table_name+row_id is not unique on its own: the INSERT half
              // of a space's first chronicle save and its immediate rev-bump
              // UPDATE are two rows sharing one timelines id in the same
              // event. The index guarantees uniqueness regardless of action.
              key={`${r.table_name}:${r.row_id}:${i}`}
              className="flex items-start gap-2 text-sm font-body"
            >
              <span
                className={`flex-1 ${
                  r.unrestorable
                    ? 'text-[var(--text-muted)] line-through'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {r.label ?? r.row_id}
              </span>
              {/* Trust the SERVER's `group_intact`, not the client's
                  `groupCount`, to decide whether this is suppressible. The
                  grouping that produced groupCount was computed once, when
                  the card rendered; the GM may then sit on this open dialog
                  for a while before confirming, during which a player,
                  another tab, or another GM session could write to this
                  same row -- `changed_since` alone cannot tell that real
                  conflict apart from the group's own later edits (both
                  just look like "the row differs from this event's
                  after"). `group_intact === true` means the server checked,
                  at THIS preview call, that the row still matches the
                  run's newest event -- only then is it safe to call the
                  difference "the group's own doing" and suppress the
                  warning. `group_intact` is null for a plain single-event
                  card (`!== true`), so this still fires exactly as before
                  there. */}
              {r.changed_since && !r.unrestorable && r.group_intact !== true && (
                <span className="inline-flex items-center gap-1 text-xs [color:var(--danger)]">
                  <AlertTriangle size={12} />
                  {t('ledger.confirm.changedSince')}
                </span>
              )}
              {r.unrestorable && (
                <span className="text-xs text-[var(--text-muted)]">
                  {t('ledger.confirm.unrestorable', { reason: reasonText(r.reason, t) })}
                </span>
              )}
              {/* Branch on `unrestorable`, never on the mere presence of
                  `reason`: a restorable row can still carry one (e.g.
                  location_missing on a SET NULL link) to report a quiet,
                  successful side effect -- not a failure. Treating `reason`
                  itself as a failure signal would mislabel a successful
                  restore as unrestorable. */}
              {!r.unrestorable && r.reason && (
                <span className="text-xs text-[var(--text-muted)]">
                  {t('ledger.confirm.note', { reason: reasonText(r.reason, t) })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMap && (
        <p className="font-body text-xs text-[var(--text-muted)] mb-5">
          {t('ledger.confirm.thumbNote')}
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={submit} disabled={busy || !plan} className="btn-ink">
          {busy ? t('ledger.confirm.submitting') : t('ledger.confirm.submit')}
        </button>
      </div>
    </Modal>
  );
}
