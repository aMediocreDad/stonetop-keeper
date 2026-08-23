import { Feather, Maximize2, Pencil } from 'lucide-react';
import { useT } from '@/i18n';
import { useIsGm } from '@/hooks/useRole';
import type { EditingPresence } from '@/lib/db';
import type { Season, StoredSeason } from '@/types';
import { normalizeSeason } from '@/lib/timeline/seasonEntry';
import { hasSeasonText } from '@/lib/timeline/timelineRange';
import { RichText } from '@/components/shared/RichText';
import { toSeasonHtml } from './seasonHtml';
import { SEASON_COLOR, SEASON_MARKS, SEASON_NAME_KEY } from './seasons';

interface SeasonFieldProps {
  season: Season;
  value: StoredSeason | undefined;
  /** Strand MJ de la même saison — absent/vide pour les non-MJ. */
  gmValue?: StoredSeason;
  onOpen: (season: Season) => void;
  /** Un pair écrit dans cette saison en ce moment (présence temps réel). */
  peerEditing?: EditingPresence;
}

/**
 * Carte de lecture d'une saison : RichText en lecture (HTML statique assaini,
 * mentions cliquables ET focalisables au clavier) — pas d'instance ProseMirror
 * par carte, le défilement de la roue ne re-parse plus quatre documents à
 * chaque année. Toute édition passe par le plein écran.
 */
export function SeasonField({ season, value, gmValue, onOpen, peerEditing }: SeasonFieldProps) {
  const t = useT();
  const isGm = useIsGm();
  const name = t(SEASON_NAME_KEY[season]);
  const color = SEASON_COLOR[season];

  const { title, body } = normalizeSeason(value);

  // Rendu seulement si le strand a du texte : un filet pointillé vide à
  // côté d'une saison sans note MJ se lirait comme un bug. La modale plein
  // écran (Étape 8) reste le point d'entrée pour ensemencer une saison vide.
  const gmBody = normalizeSeason(gmValue).body;
  const showGmStrand = isGm && hasSeasonText(gmValue);

  // Partagé par le bloc joueur ET le strand MJ. Les clics de mention
  // n'arrivent jamais ici : la ReadView de RichText navigue et stoppe la
  // propagation elle-même. Une sélection de texte en cours (copie) n'ouvre
  // pas la modale.
  const openOnClick = () => {
    if (window.getSelection()?.isCollapsed === false) return;
    onOpen(season);
  };

  return (
    <article
      className={`season season-${season}`}
      style={{ '--season-color': color } as React.CSSProperties}
    >
      <span className="accent-ripple" aria-hidden="true" />
      <header className="season-head">
        <span className="season-mark" style={{ color }} aria-hidden="true">
          {SEASON_MARKS[season]}
        </span>
        <div className="season-headings">
          {title ? (
            <>
              <span className="season-overline">{name}</span>
              <h3 className="season-name">{title}</h3>
            </>
          ) : (
            <h3 className="season-name">{name}</h3>
          )}
        </div>
        {peerEditing && (
          <span
            className={`season-presence font-body${peerEditing.role === 'gm' ? ' is-gm' : ''}`}
            role="status"
          >
            <Feather size={12} aria-hidden="true" />
            <span>
              {t(peerEditing.role === 'gm' ? 'chronicles.presenceGm' : 'chronicles.presencePlayer')}
            </span>
          </span>
        )}
      </header>

      <div className="season-body">
        <span className="season-edit-hint" aria-hidden="true">
          <Pencil size={14} />
        </span>
        {/* Clic = raccourci pointeur ; l'accès clavier/lecteur d'écran passe
            par le bouton Ouvrir. Une mention cliquée ouvre sa fiche ; une
            sélection de texte en cours (copie) ne doit pas ouvrir la modale. */}
        {/* `has-gm-strand` : le dégagement du bouton Focus (padding-bas 2.6rem)
            migre sur le DERNIER bloc — le strand MJ, lui aussi .season-display —
            pour que le texte partagé colle au filet : une seule pièce continue. */}
        <div
          className={`season-display${showGmStrand ? ' has-gm-strand' : ''}`}
          onClick={openOnClick}
        >
          <RichText content={toSeasonHtml(body || '')} editable={false} bare />
        </div>
        {showGmStrand && (
          <div className="season-display season-gm" onClick={openOnClick}>
            <span className="season-gm-rule" aria-hidden="true" />
            <RichText content={toSeasonHtml(gmBody || '')} editable={false} bare />
          </div>
        )}
        <button
          type="button"
          className="season-focus-btn"
          onClick={() => onOpen(season)}
          aria-label={t('chronicles.fullscreen', { season: name })}
          title={t('chronicles.fullscreen', { season: name })}
        >
          <Maximize2 size={15} />
          <span>{t('chronicles.focus')}</span>
        </button>
      </div>
    </article>
  );
}
