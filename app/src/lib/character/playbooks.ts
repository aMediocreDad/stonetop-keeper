import { createRolePrefixCodec } from './rolePrefix';

/**
 * Livrets (playbooks) Stonetop — dérivés du champ libre `role` (« Blessed ·
 * initiate of Danu ») via le codec [lib/rolePrefix] : pas de colonne dédiée,
 * pas de migration, les fiches saisies à la main se parsent telles quelles.
 */

export type PlaybookKey =
  | 'blessed'
  | 'fox'
  | 'heavy'
  | 'judge'
  | 'lightbearer'
  | 'marshal'
  | 'ranger'
  | 'seeker'
  | 'wouldbehero';

export const PLAYBOOKS: ReadonlyArray<{ key: PlaybookKey; name: string }> = [
  { key: 'blessed', name: 'Blessed' },
  { key: 'fox', name: 'Fox' },
  { key: 'heavy', name: 'Heavy' },
  { key: 'judge', name: 'Judge' },
  { key: 'lightbearer', name: 'Lightbearer' },
  { key: 'marshal', name: 'Marshal' },
  { key: 'ranger', name: 'Ranger' },
  { key: 'seeker', name: 'Seeker' },
  { key: 'wouldbehero', name: 'Would-Be Hero' },
];

const codec = createRolePrefixCodec(PLAYBOOKS);

export interface ParsedRole {
  playbook: PlaybookKey | null;
  /** Reste du rôle (texte libre), sans le nom du livret ni le séparateur. */
  rest: string;
}

export function parseRole(role: string): ParsedRole {
  const { prefix, rest } = codec.parse(role);
  return { playbook: prefix, rest };
}

export const composeRole = codec.compose;
