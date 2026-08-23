import type { Character, Relation } from '@/types';

/**
 * Appartenance aux groupes, dérivée des relations `membre`.
 * Une relation `membre` dont EXACTEMENT une extrémité est un personnage
 * de type GROUPE = « l'autre extrémité est membre du groupe ». Les
 * relations `membre` groupe↔groupe ou perso↔perso sont inertes (arêtes
 * ordinaires dans le graphe) — et de même pour groupe↔DISCOVERY : une
 * découverte est une chose qu'on trouve, jamais un membre.
 */
export interface GroupMembership {
  /** groupId → ids des membres. */
  members: Map<string, string[]>;
  /** Relations consommées par la carte (masquées dans le graphe : la bulle les remplace). */
  membershipRelationIds: Set<string>;
}

export function resolveGroupMembers(
  characters: Pick<Character, 'id' | 'type'>[],
  relations: Pick<Relation, 'id' | 'from_character_id' | 'to_character_id' | 'relation_type'>[],
): GroupMembership {
  const typeById = new Map(characters.map((c) => [c.id, c.type]));
  const members = new Map<string, string[]>();
  const membershipRelationIds = new Set<string>();
  for (const r of relations) {
    if (r.relation_type !== 'membre') continue;
    const fromIsGroup = typeById.get(r.from_character_id) === 'GROUPE';
    const toIsGroup = typeById.get(r.to_character_id) === 'GROUPE';
    if (fromIsGroup === toIsGroup) continue; // 0 ou 2 groupes → arête ordinaire
    const groupId = fromIsGroup ? r.from_character_id : r.to_character_id;
    const memberId = fromIsGroup ? r.to_character_id : r.from_character_id;
    if (!typeById.has(memberId)) continue;
    // A discovery is a thing found, never a member — the same reason
    // isFollower (lib/character/statblock.ts) refuses discovery followerhood.
    // Inert, exactly like the group↔group / non-group↔non-group case above:
    // it renders as an ordinary bond, not a roster row.
    if (typeById.get(memberId) === 'DISCOVERY') continue;
    if (!members.has(groupId)) members.set(groupId, []);
    members.get(groupId)!.push(memberId);
    membershipRelationIds.add(r.id);
  }
  return { members, membershipRelationIds };
}
