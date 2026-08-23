import { Undo2 } from 'lucide-react';
import { describeRevision } from '@/lib/revisions/describeRevision';
import type { RevisionEventGroup } from '@/lib/revisions/groupRevisions';
import { useT } from '@/i18n';

interface Props {
  group: RevisionEventGroup;
  /**
   * `expectEventId` is the group's newest event, passed only when
   * `groupCount > 1` -- it lets the confirm modal ask the server whether
   * the row has ONLY moved because of the group's own later edits
   * (`group_intact`), or because of something else that landed since. A
   * single-event card never passes it, so it behaves exactly as before.
   */
  onUndo: (eventId: string, groupCount: number, expectEventId?: string) => void;
}

const ACTOR_KEY = {
  gm: 'ledger.actorGm',
  player: 'ledger.actorPlayer',
  viewer: 'ledger.actorPlayer',
} as const;

export function LedgerEventCard({ group, onUndo }: Props) {
  const t = useT();
  const { newest, oldest, count } = group;
  // The headline and cascade lines always describe the newest event: that's
  // the one the GM recognizes ("what did I just write"), and for a run of
  // same-row updates every row in between describes the same field-change
  // shape anyway (see describeRevision — it only ever reads `newest.rows`).
  const { headline, lines } = describeRevision(newest);

  return (
    <li className="card-paper p-5 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {/* Headline names campaign entities — serif reading voice (the body
            default), not the Alegreya Sans UI chrome used for the rest of the
            card. */}
        <p className="text-[var(--text-primary)]">
          {t(headline.key, resolveFields(headline.vars, t))}
        </p>
        {lines.length > 0 && (
          <p className="font-body text-sm text-[var(--text-secondary)] mt-1">
            {lines.map((l) => t(l.key, l.vars)).join(' · ')}
          </p>
        )}
        <p className="label-overline mt-2 text-[var(--text-muted)]">
          {t(newest.actor_role ? ACTOR_KEY[newest.actor_role] : 'ledger.actorUnknown')}
          {' · '}
          {count > 1 ? (
            <>
              {t('ledger.editCount', { n: count })}
              {' · '}
              {formatSpan(oldest.at, newest.at)}
            </>
          ) : (
            new Date(newest.at).toLocaleString()
          )}
        </p>
      </div>
      <button
        type="button"
        // A grouped card's Revert targets the OLDEST event in the run, not
        // the newest. Restores are whole-row: applying `oldest`'s `before`
        // image returns the row to its state from immediately before the
        // whole burst, undoing every edit in the run with one RPC call --
        // which is what "revert this writing session" means to the GM
        // looking at a collapsed card. Targeting `newest` instead would
        // only undo the last debounce tick and leave the other N-1 edits
        // standing, silently contradicting what the collapsed card implies.
        // Safe because the run is a strictly *adjacent* stretch of events
        // for this exact row (see groupRevisionEvents) -- no other event
        // for this row falls between `oldest` and `newest`, so nothing
        // outside the group's own span is touched by targeting `oldest`.
        // `count` rides along so the confirm modal can tell a grouped revert
        // from a single one -- see UndoConfirmModal's `groupCount` prop.
        // `newest.event_id` rides along too, but ONLY when count > 1, as the
        // server-side expectation for `group_intact` (see db.previewUndoEvent)
        // -- never for a single-event card, which has no group to verify.
        onClick={() => onUndo(oldest.event_id, count, count > 1 ? newest.event_id : undefined)}
        className="btn-outline text-sm flex-shrink-0"
      >
        <Undo2 size={14} />
        {t('ledger.undo')}
      </button>
    </li>
  );
}

/** "7/25/2026, 6:03 PM – 6:11 PM": full date+time on the start (so a GM
 * scrolling back to an old session still sees *which day*, matching what
 * the single-event branch above always showed), hour:minute only on the
 * end (the date doesn't need repeating, and seconds are just noise for a
 * "quiet" metadata line). */
function formatSpan(oldestAt: string, newestAt: string): string {
  const timeOnly: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const start = new Date(oldestAt).toLocaleString();
  const end = new Date(newestAt).toLocaleTimeString(undefined, timeOnly);
  return `${start} – ${end}`;
}

/**
 * `describeRevision` renvoie des noms de champs comme clés i18n
 * (`ledger.field.notes`) : on les traduit avant l'interpolation.
 */
function resolveFields(
  vars: Record<string, string | number> | undefined,
  t: ReturnType<typeof useT>,
): Record<string, string | number> | undefined {
  if (!vars) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = typeof v === 'string' && v.startsWith('ledger.field.')
      ? t(v as Parameters<typeof t>[0])
      : v;
  }
  return out;
}
