/**
 * Géométrie des bulles de groupes (vue Graphe). La bulle est un DISQUE de
 * rayon fixe, fonction du nombre de membres — pas des positions. La
 * simulation fait respecter le contrat visuel : les membres sont tirés à
 * l'intérieur du disque, les étrangers en sont expulsés. « Dans le cercle »
 * veut donc dire « membre ».
 */
export interface BubblePoint {
  x: number;
  y: number;
}

export interface BubbleCircle {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Rayon du disque (en unités graphe) pour n membres : aire ∝ n, calibré
 * sur l'échelle réelle du layout (répulsion ~800, linkDistance ~200 —
 * l'espacement naturel entre nœuds se compte en dizaines d'unités, pas en
 * rayons de collision), plancher confortable pour les petits groupes.
 */
export function groupDiscRadius(memberCount: number): number {
  return 34 * Math.sqrt(memberCount) + 28;
}

/** Le point est-il dans le cercle (bord inclus) ? */
export function pointInCircle(p: BubblePoint, c: BubbleCircle): boolean {
  return Math.hypot(p.x - c.cx, p.y - c.cy) <= c.r;
}
