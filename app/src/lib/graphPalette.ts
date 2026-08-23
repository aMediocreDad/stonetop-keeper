import { FALLBACK_LOCATION_COLOR, getRelationType } from './constants';
import type { Character, Location, Relation } from '@/types';

/**
 * Helpers de palette pour la vue Graphe.
 * Centralise les calculs de couleur des nœuds (lieu) et arêtes (type de relation).
 */

/**
 * Map { locationId → color } pour lookup O(1) lors du build du graph.
 * Inclut une entrée vide pour les personnages sans lieu.
 */
export function buildLocationColorMap(locations: Location[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const loc of locations) map[loc.id] = loc.color;
  return map;
}

export function getCharacterColor(
  character: Pick<Character, 'location'>,
  colorMap: Record<string, string>
): string {
  if (!character.location) return FALLBACK_LOCATION_COLOR;
  return colorMap[character.location] ?? FALLBACK_LOCATION_COLOR;
}

export function getRelationColor(relation: Pick<Relation, 'relation_type'>): string {
  return getRelationType(relation.relation_type).color;
}

/**
 * Teinte de remplissage des nœuds de type `MENACE` (fiches de menace) —
 * braise rouge, dans la même famille que le rouge "ennemi" des relations
 * (#9B3A2D) mais distincte : une menace se reconnaît au premier coup d'œil,
 * indépendamment du lieu auquel elle est rattachée.
 */
export const MENACE_NODE_COLOR = '#8C3122';

/**
 * Fill for `DISCOVERY` nodes — a verdigris patina, the colour of a found
 * bronze thing. Same job as MENACE_NODE_COLOR: recognisable at a glance
 * whatever the tint of the place it is attached to, because "what there is to
 * find" is not a property of where it sits.
 *
 * Darker than the relation palette's teal (#3F8B8B, `compagnon`) on purpose:
 * a node and an edge must never read as the same ink. Shared with the
 * `leads-to` relation type (lib/constants) — a discovery's own edge.
 */
export const DISCOVERY_NODE_COLOR = '#2F6D72';

/**
 * Convertit un hex en rgba avec alpha donné. Utile pour le halo des PJ
 * et le fade des nœuds non-focus au hover.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned.split('').map((c) => c + c).join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Taille (rayon) d'un nœud, fixe selon le type.
 * PJ légèrement plus gros (liseré doré côté Sigma) ; groupes sans membre
 * un peu plus gros qu'un PNJ (liseré gris). Pas d'amplification par degré.
 */
export function nodeSize(_degree: number, type: Character['type']): number {
  if (type === 'PJ') return 9;
  if (type === 'GROUPE') return 7;
  // A discovery is a node like an NPC: it is a thing in the web, not a
  // protagonist. Falling through here would have been correct too — it is
  // spelled out so the next reader does not have to check.
  if (type === 'DISCOVERY') return 6;
  return 6;
}
