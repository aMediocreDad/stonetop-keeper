// Imports relatifs à dessein : le worker MCP consomme ce module et son
// vitest ne résout pas l'alias `@` (import de valeur, pas seulement de type).
import { htmlToText, textToHtml } from '../campaign/html';
import type { ThreatPortent, ThreatSheet, ThreatType } from '../../types';
import { THREAT_TYPE_KEYS } from './threatTypes';

/**
 * Frontière unique de lecture des fiches de menace — même rôle que
 * [lib/seasonEntry] pour les saisons. La forme legacy (enjeux en HTML
 * Tiptap, fatalité en texte nu) est convertie ici ; la restauration de
 * révisions pouvant ressusciter l'ancienne forme, cette normalisation
 * doit rester en place indéfiniment. Sans DOM : ce module est aussi
 * importé par le worker MCP.
 */

/** Fiche de menace vierge — anatomie du livre : instinct, présages, fatalité, enjeux, actions MJ. */
export function emptyThreatSheet(): ThreatSheet {
  return {
    instinct: '',
    portents: [],
    impendingDoom: { text: '', done: false },
    stakes: [],
    gmMoves: [],
    type: null,
  };
}

/** Vrai si le HTML Tiptap contient du texte réel (même convention que `hasSeasonText`). */
export function hasRichText(html: string): boolean {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim() !== '';
}

const HTML_TAG = /<[a-z][^>]*>/i;

function asPortent(raw: unknown): ThreatPortent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== 'string') return null;
  return { text: r.text, done: r.done === true };
}

/** Enjeux legacy (HTML) → items de checklist : un bloc/li = une question. */
function stakesFromLegacyHtml(html: string): ThreatPortent[] {
  return htmlToText(html)
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .map((text) => ({ text, done: false }));
}

/** Retourne toujours un objet frais — les appelants peuvent le muter. */
export function normalizeThreatSheet(raw: unknown): ThreatSheet {
  const base = emptyThreatSheet();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  const doomRaw = asPortent(r.impendingDoom) ?? base.impendingDoom;
  const impendingDoom: ThreatPortent = {
    // Texte nu (ancienne forme : une ligne de la checklist) → paragraphe.
    text: doomRaw.text && !HTML_TAG.test(doomRaw.text) ? textToHtml(doomRaw.text) : doomRaw.text,
    done: doomRaw.done,
  };

  const stakes =
    typeof r.stakes === 'string'
      ? stakesFromLegacyHtml(r.stakes)
      : Array.isArray(r.stakes)
        ? r.stakes.map(asPortent).filter((p): p is ThreatPortent => p !== null)
        : [];

  return {
    instinct: typeof r.instinct === 'string' ? r.instinct : '',
    portents: Array.isArray(r.portents)
      ? r.portents.map(asPortent).filter((p): p is ThreatPortent => p !== null)
      : [],
    impendingDoom,
    stakes,
    gmMoves: Array.isArray(r.gmMoves)
      ? r.gmMoves.filter((m): m is string => typeof m === 'string')
      : [],
    type: typeof r.type === 'string' && THREAT_TYPE_KEYS.has(r.type) ? (r.type as ThreatType) : null,
  };
}
