import { useT } from '@/i18n';
import { useCanEdit } from '@/hooks/useRole';
import type { Season } from '@/types';
import { SEASON_COLOR, SEASON_MARKS, SEASON_NAME_KEY } from './seasons';

interface SeasonAddCardProps {
  season: Season;
  onExpand: (season: Season) => void;
}

/**
 * Carte compacte « + saison » : remplace l'éditeur quand la saison est vide.
 * Rien à lire pour une saison vide : masquée en lecture seule (viewer).
 */
export function SeasonAddCard({ season, onExpand }: SeasonAddCardProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const name = t(SEASON_NAME_KEY[season]);

  if (!canEdit) return null;

  return (
    <button
      type="button"
      className={`season-add season-${season}`}
      style={{ '--season-color': SEASON_COLOR[season] } as React.CSSProperties}
      onClick={() => onExpand(season)}
    >
      <span className="season-mark" style={{ color: SEASON_COLOR[season] }} aria-hidden="true">
        {SEASON_MARKS[season]}
      </span>
      <span className="season-add-label">{t('chronicles.addSeason', { season: name })}</span>
    </button>
  );
}
