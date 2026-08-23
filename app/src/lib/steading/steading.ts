import type { ImprovementRequirement, Location, Steading, SteadingImprovement } from '@/types';

/** Bornes des pistes de stats (cases -1..+3 du playbook). */
export const TRACK_MIN = -1;
export const TRACK_MAX = 3;

export function clampTrack(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(TRACK_MIN, Math.min(TRACK_MAX, Math.round(v)));
}

/** Compteurs ≥ 0 (Surplus, trésor). */
export function clampCount(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.round(v));
}

/**
 * Nombre de coches d'un prérequis : « Pull Together ×5 » → 5, sinon 1.
 * Déduit du texte (×N ou xN) plutôt que stocké, pour que les fiches déjà
 * enregistrées en base profitent du suivi détaillé sans migration.
 */
export function requirementCount(req: ImprovementRequirement): number {
  const m = req.text.match(/(?:×|\bx)\s?(\d+)/i);
  const n = m ? parseInt(m[1], 10) : 1;
  return n >= 1 ? n : 1;
}

/** Coches faites, bornées à [0, count]. `done` (ancien format) vaut tout coché. */
export function requirementTicks(req: ImprovementRequirement): number {
  const count = requirementCount(req);
  if (req.done) return count;
  return Math.max(0, Math.min(count, req.progress ?? 0));
}

export function improvementProgress(imp: SteadingImprovement): { done: number; total: number } {
  return imp.requirements.reduce(
    (acc, r) => ({
      done: acc.done + requirementTicks(r),
      total: acc.total + requirementCount(r),
    }),
    { done: 0, total: 0 },
  );
}

/**
 * Lieu-bourgade affiché par la bannière quand le filtre est « tous » :
 * le plus ancien lieu portant une fiche steading (spec : « oldest wins »).
 */
export function findSteadingLocation(locations: Location[]): Location | undefined {
  return locations
    .filter((l) => !!l.steading)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
}

// ----------------------------------------------------------------------
// Registre des éditions de fiche en attente de sauvegarde (debounce).
// Consulté par useLocations pour que les refetchs temps réel n'écrasent
// pas une saisie locale en cours — même rôle que `dirtyRef` dans useTimeline.
// ----------------------------------------------------------------------
export const pendingSteading = new Map<string, Steading>();

/** Réapplique les éditions en attente par-dessus une liste fraîchement fetchée. */
export function mergePendingSteading(list: Location[]): Location[] {
  if (pendingSteading.size === 0) return list;
  return list.map((l) => {
    const pending = pendingSteading.get(l.id);
    return pending ? { ...l, steading: pending } : l;
  });
}
