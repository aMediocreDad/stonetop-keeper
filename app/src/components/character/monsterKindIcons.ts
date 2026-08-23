import type { MonsterKind } from '@/lib/character/monsterKinds';
import { kindOf } from '@/lib/character/statblock';
// npc/faction : le pack réutilise les mêmes glyphes que les tampons d'entité
// du tier 1 — on pointe sur les fichiers existants plutôt que de les dupliquer.
import npc from '@/assets/stonetop/entity-character.png';
import faction from '@/assets/stonetop/entity-group.png';
import beast from '@/assets/stonetop/danger-beast.png';
import construct from '@/assets/stonetop/danger-construct.png';
import emanation from '@/assets/stonetop/danger-emanation.png';
import enigma from '@/assets/stonetop/danger-enigma.png';
import fae from '@/assets/stonetop/danger-fae.png';
import hazard from '@/assets/stonetop/danger-hazard.png';
import infected from '@/assets/stonetop/danger-infected.png';
import maker from '@/assets/stonetop/danger-maker.png';
import spirit from '@/assets/stonetop/danger-spirit.png';
import thingbelow from '@/assets/stonetop/danger-thingbelow.png';
import tulpa from '@/assets/stonetop/danger-tulpa.png';
import undead from '@/assets/stonetop/danger-undead.png';
import type { Character } from '@/types';

/**
 * Tampons officiels des catégories du bestiaire (Jason Lutes, CC BY 4.0 —
 * voir NOTICE.md). Séparé de lib/monsterKinds.ts pour garder la logique
 * parse pure (testable sans imports d'assets Vite).
 */
export const MONSTER_KIND_ICONS: Record<MonsterKind, string> = {
  npc,
  beast,
  construct,
  emanation,
  enigma,
  faction,
  fae,
  hazard,
  infected,
  maker,
  spirit,
  thingbelow,
  tulpa,
  undead,
};

/** Tampon de la catégorie de bestiaire ; null = pas de kind (le tampon
 *  d'entité par défaut reste alors en place).
 *
 *  Un GROUPE en a un comme les autres dès qu'il est marqué monstre : une horde
 *  de crinwin EST une bête, et « group » n'est qu'un tag d'organisation par
 *  dessus. L'ancienne suppression pour les GROUPE visait une
 *  ligne « Type » toujours visible qui faisait doublon avec le type d'entité ;
 *  depuis que le sélecteur vit sous la case Monstre, la supprimer ici ferait
 *  l'inverse — un sélecteur qui ne change rien à l'écran. */
export function monsterKindIcon(
  c: Pick<Character, 'kind' | 'statblock' | 'type'>,
): string | null {
  const kind = kindOf(c);
  return kind ? MONSTER_KIND_ICONS[kind] : null;
}
