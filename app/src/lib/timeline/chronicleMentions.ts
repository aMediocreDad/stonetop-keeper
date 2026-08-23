import type { Season, Timeline } from '@/types';
import { seasonBody } from './seasonEntry';

const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export interface ChronicleMention {
  year: number;
  season: Season;
}

/**
 * Rétroliens : où une fiche est citée (`@mention`) dans la chronique.
 * Recherche par attribut `data-id` sérialisé — pas de parsing HTML complet,
 * le format est entièrement contrôlé par notre extension Mention.
 */
export function findChronicleMentions(
  entries: Timeline['entries'],
  mentionId: string,
): ChronicleMention[] {
  const needle = `data-id="${mentionId}"`;
  const out: ChronicleMention[] = [];
  for (const [yearStr, seasons] of Object.entries(entries)) {
    const year = Number(yearStr);
    if (Number.isNaN(year) || !seasons) continue;
    for (const season of SEASON_ORDER) {
      const html = seasonBody(seasons[season]);
      if (html.includes(needle)) out.push({ year, season });
    }
  }
  return out.sort(
    (a, b) => a.year - b.year || SEASON_ORDER.indexOf(a.season) - SEASON_ORDER.indexOf(b.season),
  );
}
