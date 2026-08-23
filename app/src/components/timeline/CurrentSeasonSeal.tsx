import { useT } from '@/i18n';
import type { Timeline } from '@/types';
import { SEASON_COLOR, SEASON_MARKS, SEASON_NAME_KEY } from './seasons';

interface CurrentSeasonSealProps {
  timeline: Timeline;
  /** Clic sur le sceau : ramène la roue sur l'année actuelle. */
  onJump: (year: number) => void;
}

/**
 * Sceau « saison actuelle » (lecture seule), intégré à la barre de la roue.
 * La valeur est dérivée de l'entrée la plus avancée (plus de sélecteurs) ; le
 * sceau coloré saute simplement vers cette année. Masqué si la frise est vide.
 */
export function CurrentSeasonSeal({ timeline, onJump }: CurrentSeasonSealProps) {
  const t = useT();
  const season = timeline.current_season;
  const year = timeline.current_year;
  if (season == null || year == null) return null;

  return (
    <div className="current-cluster">
      <button
        type="button"
        className="cluster-mark"
        style={{ color: SEASON_COLOR[season] }}
        onClick={() => onJump(year)}
        title={t('chronicles.jumpToCurrent')}
        aria-label={t('chronicles.jumpToCurrent')}
      >
        {SEASON_MARKS[season]}
      </button>
      <span className="cluster-now">
        {t(SEASON_NAME_KEY[season])} · {t('chronicles.year')} {year}
      </span>
    </div>
  );
}
