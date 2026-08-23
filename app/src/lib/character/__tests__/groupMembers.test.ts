import { describe, expect, it } from 'vitest';
import { resolveGroupMembers } from '../groupMembers';

const chars = [
  { id: 'g1', type: 'GROUPE' as const },
  { id: 'g2', type: 'GROUPE' as const },
  { id: 'a', type: 'PNJ' as const },
  { id: 'b', type: 'PJ' as const },
  { id: 'd1', type: 'DISCOVERY' as const },
];

const rel = (id: string, from: string, to: string, type = 'membre') => ({
  id, from_character_id: from, to_character_id: to, relation_type: type,
});

describe('resolveGroupMembers', () => {
  it('maps members to their group regardless of relation direction', () => {
    const { members, membershipRelationIds } = resolveGroupMembers(chars, [
      rel('r1', 'a', 'g1'),
      rel('r2', 'g1', 'b'),
    ]);
    expect(members.get('g1')?.sort()).toEqual(['a', 'b']);
    expect(membershipRelationIds).toEqual(new Set(['r1', 'r2']));
  });

  it('supports a character belonging to two groups (overlap)', () => {
    const { members } = resolveGroupMembers(chars, [
      rel('r1', 'a', 'g1'),
      rel('r2', 'a', 'g2'),
    ]);
    expect(members.get('g1')).toEqual(['a']);
    expect(members.get('g2')).toEqual(['a']);
  });

  it('ignores membre relations between two groups or two non-groups', () => {
    const { members, membershipRelationIds } = resolveGroupMembers(chars, [
      rel('r1', 'g1', 'g2'),
      rel('r2', 'a', 'b'),
    ]);
    expect(members.size).toBe(0);
    expect(membershipRelationIds.size).toBe(0);
  });

  it('ignores non-membre relations and unknown endpoints', () => {
    const { members } = resolveGroupMembers(chars, [
      rel('r1', 'a', 'g1', 'ami'),
      rel('r2', 'ghost', 'g1'),
    ]);
    expect(members.size).toBe(0);
  });

  // A discovery is a thing found, never a member — same reason isFollower
  // refuses discovery followerhood (lib/character/statblock.ts). Mirrors the
  // group↔group / non-group↔non-group inert case just above: both `members`
  // AND `membershipRelationIds` must stay empty, or the row would vanish from
  // the generic bond list (which excludes ids in that set) without landing in
  // the roster either — a swallowed relation.
  it('ignores a membre relation between a GROUPE and a DISCOVERY', () => {
    const { members, membershipRelationIds } = resolveGroupMembers(chars, [
      rel('r1', 'g1', 'd1'),
      rel('r2', 'd1', 'g2'),
    ]);
    expect(members.size).toBe(0);
    expect(membershipRelationIds.size).toBe(0);
  });
});
