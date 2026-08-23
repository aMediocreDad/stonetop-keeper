import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { LedgerEventCard } from '@/components/ledger/LedgerEventCard';
import { UndoConfirmModal } from '@/components/ledger/UndoConfirmModal';
import { Toast } from '@/components/shared/Toast';
import { useAppStore } from '@/stores/appStore';
import { useRevisions } from '@/hooks/useRevisions';
import { groupRevisionEvents } from '@/lib/revisions/groupRevisions';
import { useIsGm } from '@/hooks/useRole';
import { useT } from '@/i18n';

export default function LedgerPage() {
  const t = useT();
  const navigate = useNavigate();
  const isGm = useIsGm();
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);
  // Le hook ne doit pas interroger le serveur pour un non-MJ : la redirection
  // ci-dessous n'arrive qu'au prochain rendu (effet), donc un spaceId
  // n'est passé qu'une fois la garde MJ+session confirmée.
  const { events, status, hasMore, loadMore, retry, preview, undo } = useRevisions(
    session && isGm ? session.space.id : undefined,
  );
  // groupCount rides along with the eventId so the confirm modal can tell a
  // grouped revert (this targets the group's oldest event, by design — see
  // LedgerEventCard) from a genuine single-event one. expectEventId (the
  // group's newest event) is forwarded to the preview RPC so the server can
  // verify group_intact against LIVE state, not the client's stale snapshot
  // of what the grouping looked like when the card rendered.
  const [undoing, setUndoing] = useState<
    { eventId: string; groupCount: number; expectEventId?: string } | null
  >(null);

  // Le serveur refuse déjà les non-MJ ; l'UI ne doit pas proposer la page.
  useEffect(() => {
    if (!session) navigate('/');
    else if (!isGm) navigate('/dashboard');
  }, [session, isGm, navigate]);

  if (!session || !isGm) return null;

  const confirmUndo = async (eventId: string) => {
    try {
      const result = await undo(eventId);
      const restored = result.rows.some((r) => r.status === 'done');
      const skipped = result.rows.filter((r) => r.status === 'skipped').length;
      showToast(
        !restored
          ? t('ledger.result.none')
          : skipped
            ? t('ledger.result.partial', { n: skipped })
            : t('ledger.result.done'),
      );
    } catch (err) {
      console.error('[Ledger] undo failed:', err);
      showToast(t('common.saveError'));
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              title={t('character.backToGrimoire')}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <p className="label-overline [color:var(--gm-accent)]">{t('ledger.overline')}</p>
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-[var(--text-primary)] mt-2">
                {t('ledger.title')}
              </h1>
            </div>
          </div>
        </motion.div>

        {status === 'loading' && events.length === 0 ? (
          <div className="card-paper border-dashed p-16 text-center" aria-busy="true">
            <p className="text-[var(--text-muted)] font-body">{t('common.loading')}</p>
          </div>
        ) : status === 'error' && events.length === 0 ? (
          <div className="card-paper border-dashed p-16 text-center">
            <p className="text-[var(--text-muted)] font-body mb-4">{t('common.loadError')}</p>
            <button type="button" onClick={retry} className="btn-outline text-sm">
              {t('common.retry')}
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="card-paper border-dashed p-16 text-center">
            <p className="text-[var(--text-muted)] font-body">{t('ledger.empty')}</p>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {/* Grouping runs over `events` -- the page(s) loaded so far --
                  not the full ledger, so a burst of edits straddling a
                  loadMore boundary only groups as far as has loaded, and
                  re-groups (the run extends) once the next page arrives and
                  this recomputes over the longer list. Acceptable: the run
                  is still adjacent within what's shown, it just may briefly
                  render as two cards until the rest loads. */}
              {groupRevisionEvents(events).map((g) => (
                <LedgerEventCard
                  key={g.key}
                  group={g}
                  onUndo={(eventId, groupCount, expectEventId) =>
                    setUndoing({ eventId, groupCount, expectEventId })
                  }
                />
              ))}
            </ul>
            {hasMore && (
              <div className="mt-6 text-center">
                <button type="button" onClick={() => void loadMore()} className="btn-outline text-sm">
                  {t('ledger.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <UndoConfirmModal
        eventId={undoing?.eventId ?? null}
        groupCount={undoing?.groupCount ?? 1}
        expectEventId={undoing?.expectEventId}
        onClose={() => setUndoing(null)}
        loadPlan={preview}
        onConfirm={confirmUndo}
      />
      <Toast />
    </div>
  );
}
