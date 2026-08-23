import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Flag, MapPin, ArrowUpRight, Sparkles } from 'lucide-react';
import { StampIcon } from '@/components/shared/StampIcon';
import steadingCover from '@/assets/stonetop/steading-cover.png';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/stores/appStore';
import { useSteading } from '@/hooks/useSteading';
import { useTimeline } from '@/hooks/useTimeline';
import { SteadingQuickStats } from '@/components/steading/SteadingQuickStats';
import { useCanEdit } from '@/hooks/useRole';
import { useT } from '@/i18n';
import type { Season } from '@/types';

interface LocationBannerProps {
  spaceId: string;
}

/** Extrait texte des notes HTML (aperçu bannière). */
function excerpt(html: string | undefined, max = 140): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = (div.textContent ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function LocationBanner({ spaceId }: LocationBannerProps) {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const [expanded, setExpanded] = useState(false);
  const filterLocationId = useAppStore((s) => s.filterLocationId);
  const locations = useAppStore((s) => s.locations);
  const characters = useAppStore((s) => s.characters);
  const showToast = useAppStore((s) => s.showToast);
  const { steadingLocation, mutateSteading, setupSteading } = useSteading(spaceId);
  const { timeline } = useTimeline(spaceId);

  // Libellés des saisons — réutilise les clés déjà définies dans chronicles.
  const seasonLabel: Record<Season, string> = {
    spring: t('chronicles.spring'),
    summer: t('chronicles.summer'),
    autumn: t('chronicles.autumn'),
    winter: t('chronicles.winter'),
  };

  const shown = useMemo(() => {
    if (filterLocationId === 'no-location') return null;
    if (filterLocationId === 'all') return steadingLocation ?? null;
    return locations.find((l) => l.id === filterLocationId) ?? null;
  }, [filterLocationId, locations, steadingLocation]);

  // Filtre « tous » sans bourgade → CTA de création (viewer : rien à créer, bannière masquée)
  if (filterLocationId === 'all' && !shown) {
    if (!canEdit) return null;
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <button
          onClick={async () => {
            try {
              await setupSteading();
              showToast(t('steading.setupDone'));
            } catch (err) {
              console.error('[Steading] setup failed:', err);
              showToast(t('steading.saveError'));
            }
          }}
          className="w-full card-paper border-dashed px-5 py-4 flex items-center justify-center gap-2 text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] transition-colors font-body text-sm"
        >
          <Sparkles size={15} />
          {t('steading.setupCta')}
        </button>
      </motion.div>
    );
  }

  if (!shown) return null;

  const isSteading = !!shown.steading;
  const residentCount = characters.filter((c) => c.location === shown.id).length;
  const marker =
    timeline.current_season && timeline.current_year != null
      ? `${seasonLabel[timeline.current_season]} · ${t('steading.yearLabel')} ${timeline.current_year}`
      : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <div className="card-paper overflow-hidden relative">
        {/* Ligne repliée — toute la ligne déplie/replie ; le nom du lieu
            navigue et stoppe la propagation pour ne pas déclencher le toggle. */}
        <div
          onClick={() => setExpanded((v) => !v)}
          className="px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap cursor-pointer hover:bg-[var(--bg-card-alt)] transition-colors"
        >
          {/* Rond de couverture du livret de bourgade (Jason Lutes, CC BY 4.0). */}
          {isSteading ? <StampIcon src={steadingCover} size={20} /> : <MapPin size={16} />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/location/${shown.id}`);
            }}
            className="font-display text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent-hover)] transition-colors inline-flex items-center gap-1"
          >
            {shown.name}
            <ArrowUpRight size={13} />
          </button>

          {isSteading && shown.steading ? (
            <span className="text-xs font-body text-[var(--text-secondary)] flex flex-wrap gap-x-2.5">
              <span>{t('steading.fortunes')} {shown.steading.stats.fortunes >= 0 ? '+' : ''}{shown.steading.stats.fortunes}</span>
              <span>{t('steading.surplus')} {shown.steading.stats.surplus}</span>
              <span>{t('steading.prosperity')} {shown.steading.stats.prosperity >= 0 ? '+' : ''}{shown.steading.stats.prosperity}</span>
              <span>{t('steading.defenses')} {shown.steading.stats.defenses >= 0 ? '+' : ''}{shown.steading.stats.defenses}</span>
              {(Object.entries(shown.steading.debilities) as ['diminished' | 'lacking' | 'malcontent', boolean][])
                .filter(([, on]) => on)
                .map(([k]) => (
                  // Icône lucide, pas le dingbat ⚑ : celui-ci se rendait
                  // différemment selon la plateforme (emoji couleur sur iOS).
                  <span key={k} className="italic text-[var(--text-muted)] inline-flex items-center gap-1"><Flag size={10} aria-hidden /> {t(k === 'diminished' ? 'steading.diminished' : k === 'lacking' ? 'steading.lacking' : 'steading.malcontent')}</span>
                ))}
            </span>
          ) : (
            <span className="text-xs font-body text-[var(--text-muted)]">
              {shown.description || ''}
              {shown.description ? ' · ' : ''}
              {t(residentCount === 1 ? 'location.residentCountOne' : 'location.residentCountOther', { n: residentCount })}
            </span>
          )}

          {marker && (
            <span className="font-body text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] ml-auto hidden sm:inline">
              {marker}
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            aria-label={expanded ? t('location.collapse') : t('location.expand')}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors sm:ml-0 ml-auto"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Panneau déplié */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {/* Fond parchemin (pas carte) : les tuiles de stats sont
                  elles-mêmes des .card-paper — sur fond carte on empilait
                  carte-dans-carte façon rangée de métriques SaaS ; sur le
                  parchemin, elles se posent comme sur la fiche bourgade. */}
              <div className="px-4 sm:px-5 pb-4 border-t border-[var(--border-paper)] pt-3 bg-[var(--bg-primary)]/60">
                {isSteading && shown.steading ? (
                  <SteadingQuickStats
                    steading={shown.steading}
                    onMutate={(producer) => mutateSteading(shown.id, producer)}
                  />
                ) : (
                  <p className="text-sm font-body text-[var(--text-secondary)]">
                    {excerpt(shown.notes) || shown.description || t('location.noResidents')}
                  </p>
                )}
                <button
                  onClick={() => navigate(`/location/${shown.id}`)}
                  className="btn-outline text-sm mt-3"
                >
                  {t('location.openFullSheet')}
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
