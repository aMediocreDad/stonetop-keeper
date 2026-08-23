import type { Season, StoredSeason, TimelineEntry } from '@/types';
import { normalizeSeason } from './seasonEntry';

const SEASON_KEYS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Vrai si un fragment HTML Tiptap contient du texte réel. Le HTML Tiptap
 * « vide » est `<p></p>` (ce que rend un document qu'on vient de vider) — on
 * retire balises et `&nbsp;` avant de tester. Partagée par `hasSeasonText` et
 * toute page qui stocke un document Tiptap brut, sans distinction
 * titre/corps (ex. `ToneAndContentPage`) : ne pas dupliquer ce nettoyage
 * ailleurs, importer cette fonction.
 */
export function hasHtmlText(html: string): boolean {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim() !== '';
}

/**
 * Vrai si une saison a du contenu : un titre, ou un corps HTML non vide.
 * Pilote le repli des cartes ET la plage d'années dérivée de la roue ; une
 * entrée titrée mais sans corps compte comme réelle.
 */
export function hasSeasonText(value: StoredSeason | undefined): boolean {
  const { title, body } = normalizeSeason(value);
  if (title && title.trim() !== '') return true;
  return hasHtmlText(body);
}

/** Vrai si l'entrée contient du texte dans au moins une saison. */
export function hasEntryContent(entry: TimelineEntry | undefined): boolean {
  if (!entry) return false;
  return SEASON_KEYS.some((s) => hasSeasonText(entry[s]));
}

/**
 * Plage d'années dérivée du contenu : min..max des années qui ont du texte,
 * élargie par les `extraYears` (marqueur « saison actuelle », année
 * sélectionnée sur la roue). Frise vide → an 0 seul.
 */
export function deriveYearRange(
  entries: Record<string, TimelineEntry>,
  ...extraYears: Array<number | null | undefined>
): { start: number; end: number } {
  const years: number[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    const y = Number(key);
    if (Number.isInteger(y) && hasEntryContent(entry)) years.push(y);
  }
  for (const y of extraYears) {
    if (y != null) years.push(y);
  }
  if (years.length === 0) return { start: 0, end: 0 };
  // reduce plutôt que Math.min(...years) : pas de limite de taille de pile.
  return {
    start: years.reduce((a, b) => (b < a ? b : a)),
    end: years.reduce((a, b) => (b > a ? b : a)),
  };
}

/**
 * Liste triée des années à AFFICHER sur la roue : uniquement celles qui ont du
 * texte, plus les `extraYears` (année visitée / cible de « Consigner » pas
 * encore écrite). Les années vides intermédiaires sont omises — la roue se
 * positionne par index, pas par valeur, donc les écarts de temps se referment.
 * Frise vide → an 0 seul.
 */
export function listContentYears(
  entries: Record<string, TimelineEntry>,
  ...extraYears: Array<number | null | undefined>
): number[] {
  const set = new Set<number>();
  for (const [key, entry] of Object.entries(entries)) {
    const y = Number(key);
    if (Number.isInteger(y) && hasEntryContent(entry)) set.add(y);
  }
  for (const y of extraYears) {
    if (y != null) set.add(y);
  }
  if (set.size === 0) set.add(0);
  return [...set].sort((a, b) => a - b);
}

/**
 * Saison « la plus avancée » de la frise : l'entrée non vide la plus loin dans
 * le temps (année max, puis saison max au sein de l'année). `null` si la frise
 * est vide. C'est elle qui définit le marqueur « actuel » (dérivé, plus de
 * sélecteurs) et le point de départ de « Consigner une entrée ».
 */
export function latestSeason(
  entries: Record<string, TimelineEntry>,
): { year: number; season: Season } | null {
  let best: { year: number; season: Season } | null = null;
  for (const [key, entry] of Object.entries(entries)) {
    const y = Number(key);
    if (!Number.isInteger(y) || !entry) continue;
    // De l'hiver vers le printemps : première saison écrite = la plus avancée.
    for (let i = SEASON_KEYS.length - 1; i >= 0; i--) {
      if (hasSeasonText(entry[SEASON_KEYS[i]])) {
        if (!best || y > best.year) best = { year: y, season: SEASON_KEYS[i] };
        break;
      }
    }
  }
  return best;
}

/**
 * Prochaine saison à consigner : celle qui suit `latestSeason` (l'hiver bascule
 * sur le printemps de l'année suivante). Frise vide → printemps de l'an 0.
 */
export function nextSlot(
  entries: Record<string, TimelineEntry>,
): { year: number; season: Season } {
  const last = latestSeason(entries);
  if (!last) return { year: 0, season: 'spring' };
  const idx = SEASON_KEYS.indexOf(last.season);
  return idx < SEASON_KEYS.length - 1
    ? { year: last.year, season: SEASON_KEYS[idx + 1] }
    : { year: last.year + 1, season: 'spring' };
}
