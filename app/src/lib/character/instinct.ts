// Imports relatifs à dessein : le worker MCP consomme ce module (cf. threatSheet).
import type { Character } from '../../types';
import { isFollower } from './statblock';

/**
 * Instinct effectif d'un personnage : la colonne gagne ; une révision
 * restaurée d'avant la colonne peut encore porter threat.instinct — repli
 * en lecture seule, jamais réécrit (les sauvegardes visent la colonne).
 */
export function instinctOf(c: Pick<Character, 'instinct'> & { threat?: Character['threat'] }): string {
  const own = (c.instinct ?? '').trim();
  if (own) return own;
  return (c.threat?.instinct ?? '').trim();
}

/**
 * Qui a le droit de LIRE l'instinct d'une fiche. Règle unique, partagée par la
 * fiche et par la carte du grimoire : dupliquée, elle dériverait, et le jour où
 * l'une des deux s'élargit c'est de la prep de MJ qui fuite sur la grille.
 *
 * Parité avec `app_character_mechanics_open` côté serveur
 * (supabase-statblock.sql), qui strippe déjà l'instinct des lignes qu'un
 * joueur n'a pas à voir : ce prédicat est la version cliente de la même
 * frontière, pas une garde de plus.
 */
export function instinctVisible(
  c: Pick<Character, 'type'> & Parameters<typeof isFollower>[0],
  isGm: boolean,
): boolean {
  return isGm || c.type === 'PJ' || isFollower(c);
}
