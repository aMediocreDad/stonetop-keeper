/**
 * Tri alphabétique des noms, insensible à la casse et aux accents
 * (« Éowyn » se classe avec les E). Utilisé par toutes les listes de
 * fiches : grimoire, relations, membres, mentions, lieux…
 */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function byName<T extends { name: string }>(a: T, b: T): number {
  return compareNames(a.name, b.name);
}
