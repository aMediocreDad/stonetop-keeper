import { createRolePrefixCodec, type ParsedPrefix } from './rolePrefix';

/**
 * Catégories du bestiaire Stonetop (Livre II — les glyphes danger-*).
 * Historiquement mal nommées « archétypes de menace » ; la taxonomie des
 * menaces est ailleurs (lib/threatTypes). Sert le champ statblock.kind.
 */
export type MonsterKind =
  | 'npc' | 'beast' | 'construct' | 'emanation' | 'enigma' | 'faction'
  | 'fae' | 'hazard' | 'infected' | 'maker' | 'spirit' | 'thingbelow'
  | 'tulpa' | 'undead';

export const MONSTER_KINDS: ReadonlyArray<{
  key: MonsterKind; name: string; aliases?: readonly string[];
}> = [
  { key: 'beast', name: 'Beast' },
  { key: 'construct', name: 'Construct' },
  { key: 'emanation', name: 'Emanation' },
  { key: 'enigma', name: 'Enigma' },
  // « Group », plus « Faction » : un seul mot pour la chose, et c'est celui du
  // type d'entité GROUPE. La clé reste `faction` — la renommer demanderait une
  // migration pour rien — et l'ancien libellé survit en alias, sinon les
  // anciens rôles « Faction · … » cesseraient de se parser (voir rolePrefix).
  { key: 'faction', name: 'Group', aliases: ['Faction'] },
  { key: 'fae', name: 'Fae' },
  { key: 'hazard', name: 'Hazard' },
  { key: 'infected', name: 'Infected' },
  { key: 'maker', name: 'Maker' },
  { key: 'npc', name: 'NPC' },
  { key: 'spirit', name: 'Spirit' },
  { key: 'thingbelow', name: 'Thing Below' },
  { key: 'tulpa', name: 'Tulpa' },
  { key: 'undead', name: 'Undead' },
];

const codec = createRolePrefixCodec(MONSTER_KINDS);

export type ParsedMonsterPrefix = ParsedPrefix<MonsterKind>;

/** Lecture seule des anciens préfixes « Beast · … » dans `role` — la
 *  promotion vers threat.type se fait au prochain save (lib/threatTypes).
 *  Personne ne compose plus de préfixe : compose n'est pas exporté. */
export const parseMonsterPrefix = codec.parse;
