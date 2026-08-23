import type { Character, Location } from '@/types';
import { playbookIcon } from '@/components/character/playbookIcons';
import steadingCover from '@/assets/stonetop/steading-cover.png';

/**
 * The vocabulary of @ mentions — items, prefixed ids, the sheet a mention
 * points at. Deliberately free of any Tiptap dependency: screens that display
 * or compose mentions without ever mounting an editor import from here (the
 * map's pin form, the chronicle, the sheets' backlinks). A single value
 * `import` from `@tiptap/*` in this file puts the ~130 KiB (gzip) editor
 * chunk back on those pages — which is exactly what Lighthouse reported on
 * `/#/map/:id`, and what `e2e/map-lcp.spec.ts` now guards.
 *
 * The Tiptap wiring (extension, suggestion popup) lives in `./mentions`.
 * Do NOT re-export this module from there for convenience: one such import
 * would quietly undo the split.
 */

/**
 * Mentions @ dans les éditeurs : relient le texte aux fiches (personnages,
 * lieux). Le « genre » est encodé en préfixe de l'id du nœud (`char:`/`loc:`)
 * pour rester compatible avec les attributs id/label natifs de l'extension.
 */
export interface MentionItem {
  /** Id préfixé : `char:<uuid>` ou `loc:<uuid>` (les groupes SONT des personnages → `char:`). */
  id: string;
  label: string;
  kind: 'character' | 'group' | 'location';
  /** Masque tampon spécifique (livret d'un PJ) ; sinon l'icône du `kind`. */
  icon?: string;
}

export const characterMentionId = (id: string) => `char:${id}`;
export const locationMentionId = (id: string) => `loc:${id}`;

/** Item de mention d'un personnage — les PJ portent le tampon de leur livret. */
export function characterMentionItem(
  c: Pick<Character, 'id' | 'name' | 'type' | 'role'>,
): MentionItem {
  const icon = playbookIcon(c);
  return {
    id: characterMentionId(c.id),
    label: c.name,
    kind: c.type === 'GROUPE' ? 'group' : 'character',
    ...(icon ? { icon } : null),
  };
}

/** Item de mention d'un lieu — la bourgade porte le rond de couverture du livret. */
export function locationMentionItem(
  l: Pick<Location, 'id' | 'name' | 'steading'>,
): MentionItem {
  return {
    id: locationMentionId(l.id),
    label: l.name,
    kind: 'location',
    ...(l.steading ? { icon: steadingCover } : null),
  };
}

/** Items de mention standard : personnages (groupes inclus) puis lieux. */
export function buildMentionItems(
  characters: Pick<Character, 'id' | 'name' | 'type' | 'role'>[],
  locations: Pick<Location, 'id' | 'name' | 'steading'>[],
): MentionItem[] {
  return [...characters.map(characterMentionItem), ...locations.map(locationMentionItem)];
}

/** Décompose l'id de mention ; null si le préfixe est inconnu. */
export function parseMentionId(raw: string | null | undefined):
  | { kind: 'character' | 'location'; id: string }
  | null {
  if (!raw) return null;
  if (raw.startsWith('char:')) return { kind: 'character', id: raw.slice(5) };
  if (raw.startsWith('loc:')) return { kind: 'location', id: raw.slice(4) };
  return null;
}

/**
 * Route de la fiche visée par une mention cliquée, en remontant depuis la
 * cible du clic ; null si le clic ne touche pas une mention.
 */
export function mentionSheetPath(target: HTMLElement | null): string | null {
  const el = target?.closest('[data-type="mention"]');
  const ref = parseMentionId(el?.getAttribute('data-id'));
  if (!ref) return null;
  return ref.kind === 'character' ? `/character/${ref.id}` : `/location/${ref.id}`;
}
