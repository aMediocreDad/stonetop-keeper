import type { SeasonEntry, StoredSeason } from '@/types';

/**
 * Normalize une valeur de saison stockée vers la forme objet `{ title, body }`.
 * Rétrocompat : une chaîne (ancien format / seed) devient `{ body }` sans titre.
 * Frontière unique de lecture — tout le reste manipule des `SeasonEntry`.
 */
export function normalizeSeason(value: StoredSeason | undefined): SeasonEntry {
  if (value == null) return { body: '' };
  if (typeof value === 'string') return { body: value };
  return { title: value.title, body: value.body ?? '' };
}

/** Corps HTML d'une saison (pour le rendu, la recherche de mentions, etc.). */
export function seasonBody(value: StoredSeason | undefined): string {
  return normalizeSeason(value).body;
}

/** Titre d'une saison (chaîne vide si absent). */
export function seasonTitle(value: StoredSeason | undefined): string {
  return normalizeSeason(value).title ?? '';
}

/**
 * Révision d'une saison stockée : 0 pour les formes historiques (chaîne,
 * objet sans `rev`) — la base du compare-and-swap de la sauvegarde par saison.
 */
export function storedRev(value: StoredSeason | undefined): number {
  if (value == null || typeof value === 'string') return 0;
  return value.rev ?? 0;
}
