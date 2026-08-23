import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Map as MapIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { MapFormModal } from '@/components/maps/MapFormModal';
import { GmBadge } from '@/components/shared/GmBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Toast } from '@/components/shared/Toast';
import { useAppStore } from '@/stores/appStore';
import { useMaps } from '@/hooks/useMaps';
import { useLocations } from '@/hooks/useLocations';
import { useIsGm } from '@/hooks/useRole';
import { useT } from '@/i18n';
import type { CampaignMap } from '@/types';

export default function MapsPage() {
  const t = useT();
  const navigate = useNavigate();
  const session = useAppStore((s) => s.session);
  const isGm = useIsGm();
  const spaceId = session?.space.id;
  const { maps, status, retry, deleteMap, offlineImages } = useMaps(spaceId);
  const { locations } = useLocations(spaceId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingMap, setEditingMap] = useState<CampaignMap | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CampaignMap | null>(null);

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  if (!session) return null;

  const openCreate = () => {
    setEditingMap(null);
    setModalOpen(true);
  };
  const openEdit = (map: CampaignMap) => {
    setEditingMap(map);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-3 flex-wrap"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
            title={t('character.backToGrimoire')}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="label-overline">{t('maps.overline')}</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)] leading-tight">
              {t('maps.title')}
            </h1>
          </div>
          {isGm && (
            <button onClick={openCreate} className="btn-outline">
              <Plus size={16} />
              {t('maps.addMap')}
            </button>
          )}
        </motion.div>

        {/* Progress only while bytes are actually moving. Keying this on
            `saved < total` instead meant it rendered on every visit before the
            count had been read, and stayed up permanently whenever a map could
            not be saved — a status line that is always on is just furniture. */}
        {offlineImages.syncing && offlineImages.saved < offlineImages.total && (
          <p className="label-overline mb-4 text-[var(--text-muted)]">
            {t('offline.mapsSaved', {
              saved: offlineImages.saved,
              total: offlineImages.total,
            })}
          </p>
        )}

        {maps.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {maps.map((m) => {
              const location = locations.find((l) => l.id === m.location_id);
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="group relative card-paper overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-[var(--border-focus)] focus-within:ring-inset"
                >
                  {/* Lien pleine carte vers la carte — vrai <a> (clavier + SR). */}
                  <Link
                    to={`/map/${m.id}`}
                    aria-label={m.name}
                    className="absolute inset-0 z-[1] rounded-[inherit] focus:outline-none"
                  />

                  {m.thumb ? (
                    <img
                      src={m.thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-36 object-cover"
                    />
                  ) : (
                    <div className="w-full h-36 bg-[var(--bg-card-alt)] flex items-center justify-center">
                      <MapIcon size={28} className="text-[var(--text-muted)]" />
                    </div>
                  )}

                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] truncate">
                        {m.name}
                      </h3>
                      {m.gm_only && <GmBadge />}
                    </div>

                    {m.description && (
                      <p className="mt-1 text-sm font-body text-[var(--text-secondary)] line-clamp-2">
                        {m.description}
                      </p>
                    )}

                    {location && (
                      <span className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-body text-[var(--text-muted)]">
                        <span
                          aria-hidden
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: location.color }}
                        />
                        <span className="truncate">{location.name}</span>
                      </span>
                    )}

                    {isGm && (
                      <div className="relative z-[2] flex gap-2 mt-auto pt-3">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="btn-outline flex-1 text-xs py-1.5"
                          title={t('maps.editMap')}
                          aria-label={t('maps.editMap')}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(m)}
                          className="btn-outline flex-1 text-xs py-1.5 hover:text-[var(--danger)]"
                          title={t('maps.deleteMap')}
                          aria-label={t('maps.deleteMap')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          // Store vide ≠ pas de cartes : tant que le premier fetch n'a pas
          // abouti on affiche le chargement, et un échec offre un retry.
          <div
            className="card-paper border-dashed p-8 text-center"
            aria-busy={status === 'loading'}
          >
            {status === 'loading' ? (
              <p className="text-[var(--text-muted)] font-body">{t('common.loading')}</p>
            ) : status === 'error' ? (
              <>
                <p className="text-[var(--text-muted)] font-body mb-4">{t('common.loadError')}</p>
                <button type="button" onClick={retry} className="btn-outline text-sm">
                  {t('common.retry')}
                </button>
              </>
            ) : (
              <p className="text-[var(--text-muted)] font-body">{t('maps.empty')}</p>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {modalOpen && (
          <MapFormModal
            spaceId={session.space.id}
            map={editingMap}
            onClose={() => setModalOpen(false)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete?.name ?? ''}
        description={t('maps.deleteConfirm')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          try {
            await deleteMap(target.id);
          } catch {
            useAppStore.getState().showToast(t('maps.deleteFailed'));
          }
        }}
      />

      <Toast />
    </div>
  );
}
