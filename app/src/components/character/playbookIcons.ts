import { parseRole, type PlaybookKey } from '@/lib/character/playbooks';
import type { Character } from '@/types';
import blessed from '@/assets/stonetop/playbook-blessed.png';
import fox from '@/assets/stonetop/playbook-fox.png';
import heavy from '@/assets/stonetop/playbook-heavy.png';
import judge from '@/assets/stonetop/playbook-judge.png';
import lightbearer from '@/assets/stonetop/playbook-lightbearer.png';
import marshal from '@/assets/stonetop/playbook-marshal.png';
import ranger from '@/assets/stonetop/playbook-ranger.png';
import seeker from '@/assets/stonetop/playbook-seeker.png';
import wouldbehero from '@/assets/stonetop/playbook-wouldbehero.png';

/**
 * Tampons officiels des livrets (Jason Lutes, CC BY 4.0 — voir NOTICE.md),
 * masques alpha pour StampIcon. Séparé de lib/playbooks.ts pour garder la
 * logique parse/compose pure (testable sans imports d'assets Vite).
 */
export const PLAYBOOK_ICONS: Record<PlaybookKey, string> = {
  blessed,
  fox,
  heavy,
  judge,
  lightbearer,
  marshal,
  ranger,
  seeker,
  wouldbehero,
};

/**
 * Masque du tampon de livret d'un personnage — les PJ seulement, dérivé du
 * champ `role` ; null si pas de livret reconnu (repli sur l'icône générique).
 */
export function playbookIcon(c: Pick<Character, 'type' | 'role'>): string | null {
  const playbook = c.type === 'PJ' ? parseRole(c.role).playbook : null;
  return playbook ? PLAYBOOK_ICONS[playbook] : null;
}
