/**
 * Réglages de la simulation d3-force du graphe — calqués 1-pour-1 sur
 * les sliders d'Obsidian (cf. screenshot fourni par l'utilisateur).
 *
 * Mapping vers d3-force :
 *  - `centerForce`   → `d3.forceCenter().strength(centerForce)`
 *                      Force qui rappelle les nœuds vers (0, 0).
 *  - `repelForce`    → `d3.forceManyBody().strength(-repelForce)`
 *                      Charge négative = répulsion entre nœuds.
 *  - `linkForce`     → `forceLink.strength(linkForce)`
 *                      Force des arêtes (rigidité du ressort).
 *  - `linkDistance`  → `forceLink.distance(linkDistance)`
 *                      Longueur cible des arêtes (en unités graph).
 *
 * Bornes calibrées pour des graphes de 30–60 nœuds : on privilégie un
 * layout aéré (forte répulsion + grandes distances) quitte à ce que le
 * graphe sorte du viewport — l'utilisateur peut zoomer/dézoomer.
 */
export interface ForceSettings {
  /** Force de centre. 0..1. Plus haut = nœuds plus serrés au centre. */
  centerForce: number;
  /** Force de répulsion (charge). 50..3000. Plus haut = nœuds plus écartés. */
  repelForce: number;
  /** Force de liaison (rigidité). 0..1. Plus haut = arêtes plus tendues. */
  linkForce: number;
  /** Distance cible des liens. 10..600. */
  linkDistance: number;
  /** simulation gelée (alpha = 0 forcé). */
  frozen: boolean;
}

// Valeurs par défaut élargies pour 40+ nœuds : forte répulsion, grandes
// distances, ressorts plus souples → graphe lisible sans chevauchements.
export const DEFAULT_FORCE_SETTINGS: ForceSettings = {
  centerForce: 0.05,    // (était 0.1) moins de compression vers le centre
  repelForce: 800,      // (était 250) répulsion ×3 pour aérer
  linkForce: 0.4,       // (était 0.6) ressorts moins rigides
  linkDistance: 200,    // (était 80) liens 2.5× plus longs
  frozen: false,
};

/** Bornes des sliders, exposées pour la sidebar. */
export const FORCE_BOUNDS = {
  centerForce:  { min: 0,   max: 1,    step: 0.01 },
  repelForce:   { min: 50,  max: 3000, step: 50   },  // (max était 1000)
  linkForce:    { min: 0,   max: 1,    step: 0.05 },
  linkDistance: { min: 10,  max: 600,  step: 10   },  // (max était 300)
} as const;
