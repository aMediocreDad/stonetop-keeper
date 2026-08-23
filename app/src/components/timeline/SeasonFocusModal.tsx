import { useEffect, useRef, useState } from 'react';
import { Feather, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useCanEdit, useIsGm } from '@/hooks/useRole';
import { useScrollLock } from '@/hooks/useScrollLock';
import type { EditingPresence } from '@/lib/db';
import type { ConflictEntry } from '@/lib/timeline/timelineConflict';
import type { Season, TimelineStrand } from '@/types';
import { RichText } from '@/components/shared/RichText';
import { GmBadge } from '@/components/shared/GmBadge';
import type { MentionItem } from '@/components/editor/mentionItems';
import { toSeasonHtml } from './seasonHtml';
import { SEASON_COLOR, SEASON_MARKS, SEASON_NAME_KEY, SEASONS } from './seasons';

/**
 * Bannière de conflit : la version en base est montrée en lecture, l'humain
 * tranche — « Take theirs » remplace l'éditeur (le texte local reste un
 * Cmd-Z plus loin), « Keep mine » ré-écrit consciemment par-dessus.
 */
function ConflictBanner({
  strand,
  theirs,
  onResolve,
}: {
  strand: TimelineStrand;
  theirs: ConflictEntry;
  onResolve?: (strand: TimelineStrand, resolution: 'mine' | 'theirs') => void;
}) {
  const t = useT();
  return (
    <div className="focus-conflict" role="alert">
      <p className="focus-conflict-text font-body">{t('chronicles.conflictText')}</p>
      <div className="focus-conflict-theirs">
        <span className="label-overline">{t('chronicles.conflictTheirs')}</span>
        {theirs.title && <h4 className="focus-conflict-title">{theirs.title}</h4>}
        {/* RichText en lecture (et pas un dangerouslySetInnerHTML nu) : les
            mentions du texte adverse restent suivables — clic ET clavier —
            au moment précis où on décide quelle version du récit survit. */}
        <RichText content={toSeasonHtml(theirs.body || '')} editable={false} bare />
      </div>
      {/* Hiérarchie sur un choix destructif : « Keep mine » préserve le
          texte de l'utilisateur — c'est le choix sûr, donc le seul bouton
          encre (et le focus initial). Deux primaires côte à côte ne
          donnaient aucun défaut sur la décision qui peut jeter son récit. */}
      <div className="focus-conflict-actions">
        <button type="button" className="btn-outline" onClick={() => onResolve?.(strand, 'theirs')}>
          {t('chronicles.conflictTakeTheirs')}
        </button>
        <button
          type="button"
          className="btn-ink"
          autoFocus
          onClick={() => onResolve?.(strand, 'mine')}
        >
          {t('chronicles.conflictKeepMine')}
        </button>
      </div>
    </div>
  );
}

interface SeasonFocusModalProps {
  season: Season | null;
  year: number;
  title: string;
  body: string;
  onChangeTitle: (value: string) => void;
  onChangeBody: (value: string) => void;
  /** Re-classe l'entrée. Retourne `false` si la cible est déjà occupée. */
  onMove: (toYear: number, toSeason: Season) => boolean;
  onClose: () => void;
  /** Cibles proposées en tapant `@` (fiches du grimoire). */
  mentionItems?: MentionItem[];
  /** Strand MJ de la même saison — corps seul, pas de titre distinct. */
  gmBody?: string;
  onChangeGmBody?: (value: string) => void;
  /** Pairs écrivant dans CETTE saison (déjà filtrés, sans soi-même). */
  peers?: EditingPresence[];
  /** Conflit en attente sur le strand joueur / MJ de cette saison. */
  conflict?: ConflictEntry | null;
  gmConflict?: ConflictEntry | null;
  onResolveConflict?: (strand: TimelineStrand, resolution: 'mine' | 'theirs') => void;
}

export function SeasonFocusModal({
  season,
  year,
  title,
  body,
  onChangeTitle,
  onChangeBody,
  onMove,
  onClose,
  mentionItems,
  gmBody,
  onChangeGmBody,
  peers,
  conflict,
  gmConflict,
  onResolveConflict,
}: SeasonFocusModalProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const isGm = useIsGm();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Le gel du défilement passe par le compteur partagé plutôt que par un
  // `body.style.overflow` écrit ici : cette modale et la `Modal` commune
  // peuvent coexister, et deux propriétaires du même style se marchent dessus.
  useScrollLock(season !== null);

  // Brouillon d'année : `null` = pas en cours d'édition → le champ affiche
  // l'année faisant autorité. On ne re-classe que sur Entrée ; quitter le champ
  // annule le brouillon. (Pas d'effet de synchro : on dérive de la prop.)
  const [yearDraft, setYearDraft] = useState<string | null>(null);
  const yearValue = yearDraft ?? String(year);

  useEffect(() => {
    if (!season) return undefined;
    // Dialogue modal : piéger Tab dans le panneau et rendre le focus à
    // l'élément déclencheur à la fermeture (la carte de saison).
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus initial DÉTERMINISTE : avant, il reposait sur l'autofocus de
    // l'éditeur monté en synchrone — désormais lazy (et jamais monté pour un
    // lecteur), le dialogue aria-modal s'ouvrait avec le focus resté derrière
    // lui. Garde `contains` : ne pas voler un autofocus déjà posé dans le
    // panneau (bouton « Keep mine » du conflit, éditeur déjà en cache).
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel
        .querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus();
    };
  }, [season, onClose]);

  if (!season) return null;
  const name = t(SEASON_NAME_KEY[season]);
  const color = SEASON_COLOR[season];

  const commitYear = () => {
    if (yearDraft == null) return;
    const parsed = parseInt(yearDraft.trim(), 10);
    // Fin d'édition : on retombe sur l'année faisant autorité (qui devient la
    // nouvelle cible si `onMove` réussit, ou reste inchangée s'il refuse).
    setYearDraft(null);
    if (!Number.isNaN(parsed) && parsed !== year) onMove(parsed, season);
  };

  return (
    <div
      className="focus-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${title || name} — ${t('chronicles.year')} ${year}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('focus-overlay')) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="focus-panel card-accent-left"
        style={{ '--season-color': color } as React.CSSProperties}
      >
        <header className="focus-head">
          <div className="focus-head-left">
            <span className="focus-mark" style={{ color }} aria-hidden="true">
              {SEASON_MARKS[season]}
            </span>
            <div className="focus-title-block">
              <div className="focus-meta">
                <select
                  className="focus-season"
                  aria-label={t('chronicles.seasonLabel')}
                  value={season}
                  disabled={!canEdit}
                  onChange={(e) => onMove(year, e.target.value as Season)}
                >
                  {SEASONS.map((s) => (
                    <option key={s} value={s}>{t(SEASON_NAME_KEY[s])}</option>
                  ))}
                </select>
                <span className="focus-meta-sep" aria-hidden="true">·</span>
                <span className="focus-meta-year">
                  {t('chronicles.year')}
                  <input
                    className="focus-year-input"
                    type="text"
                    inputMode="numeric"
                    pattern="-?[0-9]*"
                    aria-label={t('chronicles.year')}
                    value={yearValue}
                    disabled={!canEdit}
                    onChange={(e) => setYearDraft(e.target.value.replace(/[^0-9-]/g, ''))}
                    onBlur={() => setYearDraft(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitYear();
                    }}
                  />
                </span>
              </div>
              <input
                className="focus-title-input"
                type="text"
                value={title}
                disabled={!canEdit}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder={t('chronicles.titlePlaceholder')}
                aria-label={t('chronicles.entryTitle')}
              />
            </div>
          </div>
          <button
            type="button"
            className="focus-close"
            onClick={onClose}
            aria-label={t('chronicles.close')}
            title={t('chronicles.close')}
          >
            <X size={18} />
          </button>
        </header>
        <div className="focus-editor">
          {conflict && <ConflictBanner strand="player" theirs={conflict} onResolve={onResolveConflict} />}
          <RichText
            content={toSeasonHtml(body || '')}
            onChange={onChangeBody}
            editable={canEdit}
            placeholder={t('chronicles.seasonPlaceholder', { season: name.toLowerCase() })}
            bare
            autofocus
            mentionItems={mentionItems}
          />
          {/* Toujours visible pour le MJ (même sans texte encore) : c'est le
              point d'entrée pour ensemencer le strand — la carte de lecture,
              elle, ne montre le filet que si `gmValue` a du contenu. */}
          {isGm && onChangeGmBody && (
            <div className="focus-gm-strand">
              <div className="focus-gm-head">
                <h3>{t('chronicles.gmStrand')}</h3>
                <GmBadge />
              </div>
              <p className="focus-gm-hint">{t('chronicles.gmStrandHint')}</p>
              {gmConflict && <ConflictBanner strand="gm" theirs={gmConflict} onResolve={onResolveConflict} />}
              <div className="focus-gm-editor">
                <RichText
                  content={toSeasonHtml(gmBody || '')}
                  onChange={onChangeGmBody}
                  editable={canEdit}
                  placeholder={t('chronicles.seasonPlaceholder', { season: name.toLowerCase() })}
                  bare
                  mentionItems={mentionItems}
                />
              </div>
            </div>
          )}
        </div>
        <footer className="focus-footer">
          {peers && peers.length > 0 && (
            <span
              className={`focus-presence font-body${peers[0].role === 'gm' ? ' is-gm' : ''}`}
              role="status"
            >
              <Feather size={12} aria-hidden="true" />
              {t(peers[0].role === 'gm' ? 'chronicles.presenceGm' : 'chronicles.presencePlayer')}
            </span>
          )}
          <span className="focus-hint">{t('chronicles.focusHint')}</span>
        </footer>
      </div>
    </div>
  );
}
