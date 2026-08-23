import type { StoredSeason } from '@/types';
import { normalizeSeason, storedRev } from './seasonEntry';

/**
 * Conflit d'édition d'une saison : la version « à eux » (celle en base) telle
 * que renvoyée par le rejet compare-and-swap. `rev` sert de base à une
 * éventuelle ré-écriture consciente (« Keep mine »).
 */
export interface ConflictEntry {
  title?: string;
  body: string;
  rev: number;
}

/** Sauvegarde refusée : la révision de base est périmée. */
export class TimelineConflictError extends Error {
  readonly theirs: ConflictEntry;
  constructor(theirs: ConflictEntry) {
    super('CONFLICT');
    this.name = 'TimelineConflictError';
    this.theirs = theirs;
  }
}

/** Déplacement refusé : la saison cible a déjà du contenu. */
export class TimelineOccupiedError extends Error {
  constructor() {
    super('OCCUPIED');
    this.name = 'TimelineOccupiedError';
  }
}

/** Normalize une valeur stockée (objet, chaîne historique, absente) en ConflictEntry. */
export function toConflictEntry(value: StoredSeason | null | undefined): ConflictEntry {
  const stored = value ?? undefined;
  const { title, body } = normalizeSeason(stored);
  return { title, body, rev: storedRev(stored) };
}

/**
 * Traduit une erreur PostgREST des RPC timeline en erreur typée. Le serveur
 * signale un conflit par le message CONFLICT (errcode par défaut P0001 —
 * surtout pas 40001, que PostgREST rejouerait en boucle) avec l'entrée
 * courante en DETAIL (JSON), et un déplacement refusé par le message
 * OCCUPIED. Le test sur `code === '40001'` reste par robustesse.
 */
export function timelineErrorFromRpc(error: {
  code?: string;
  message: string;
  details?: string | null;
}): Error {
  if (error.code === '40001' || error.message === 'CONFLICT') {
    let stored: StoredSeason | null = null;
    try {
      const parsed: unknown = JSON.parse(error.details ?? 'null');
      if (typeof parsed === 'string' || (parsed !== null && typeof parsed === 'object')) {
        stored = parsed as StoredSeason;
      }
    } catch {
      // DETAIL illisible : on retombe sur « entrée absente » (rev 0)
    }
    return new TimelineConflictError(toConflictEntry(stored));
  }
  if (error.message === 'OCCUPIED') return new TimelineOccupiedError();
  return new Error(error.message);
}
