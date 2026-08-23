// Imports relatifs à dessein (module consommable par le worker MCP).
import type { Character, ThreatType } from '../../types';
import { parseMonsterPrefix, type MonsterKind } from './monsterKinds';

/** Les huit types de menace du livre. */
export const THREAT_TYPES: ReadonlyArray<{ key: ThreatType; name: string }> = [
  { key: 'affliction', name: 'Affliction' },
  { key: 'beast', name: 'Beast' },
  { key: 'institution', name: 'Institution' },
  { key: 'macguffin', name: 'MacGuffin' },
  { key: 'magical-entity', name: 'Magical entity' },
  { key: 'rabble', name: 'Rabble' },
  { key: 'villain', name: 'Villain' },
  { key: 'wildcard', name: 'Wildcard' },
];

export const THREAT_TYPE_KEYS = new Set<string>(THREAT_TYPES.map((t) => t.key));

/** Nom affichable d'un type ; null pour « pas encore choisi » ou inconnu. */
export function threatTypeName(key: ThreatType | null): string | null {
  return (key && THREAT_TYPES.find((t) => t.key === key)?.name) || null;
}

/** Seuls mappings sûrs depuis l'ancienne taxonomie (14 catégories de
 *  bestiaire) : beast→beast, faction→institution (la clé `faction`, dont le
 *  libellé se lit « Group » depuis 2026-08 — l'ancien « Faction · … » reste
 *  parsable par alias). Le reste garde son préfixe visible dans `role` — rien
 *  n'est perdu en silence. */
const LEGACY_PREFIX_TO_TYPE: Partial<Record<MonsterKind, ThreatType>> = {
  beast: 'beast',
  faction: 'institution',
};

export function legacyThreatRole(role: string): { type: ThreatType | null; rest: string } {
  const parsed = parseMonsterPrefix(role || '');
  const mapped = parsed.prefix ? LEGACY_PREFIX_TO_TYPE[parsed.prefix] : undefined;
  if (mapped) return { type: mapped, rest: parsed.rest };
  return { type: null, rest: role || '' };
}

/** Type effectif : threat.type gagne ; repli lecture seule sur l'ancien
 *  préfixe de rôle — même contrat que instinctOf (promotion au save). */
export function threatTypeOf(
  c: Pick<Character, 'role'> & { threat?: Character['threat'] },
): ThreatType | null {
  return c.threat?.type ?? legacyThreatRole(c.role || '').type;
}
