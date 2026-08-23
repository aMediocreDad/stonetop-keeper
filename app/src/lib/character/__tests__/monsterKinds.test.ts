import { describe, it, expect } from 'vitest';
import { MONSTER_KINDS, parseMonsterPrefix } from '../monsterKinds';

describe('parseMonsterPrefix', () => {
  it('splits "Kind · rest" and tolerates case/leading "The"', () => {
    expect(parseMonsterPrefix('Undead · restless dead of the barrows')).toEqual({
      prefix: 'undead',
      rest: 'restless dead of the barrows',
    });
    expect(parseMonsterPrefix('The Thing Below').prefix).toBe('thingbelow');
    expect(parseMonsterPrefix('thing below · ancient hunger').prefix).toBe('thingbelow');
  });

  it('leaves an unrecognized prefix intact (no-prefix passthrough)', () => {
    expect(parseMonsterPrefix('wildcard, villain')).toEqual({
      prefix: null,
      rest: 'wildcard, villain',
    });
    expect(parseMonsterPrefix('')).toEqual({ prefix: null, rest: '' });
  });

  it('parses the two legacy prefixes that promote into threat.type (lib/threatTypes)', () => {
    expect(parseMonsterPrefix('Beast · the hagr')).toEqual({
      prefix: 'beast',
      rest: 'the hagr',
    });
    expect(parseMonsterPrefix('Faction · the Ferrite Union')).toEqual({
      prefix: 'faction',
      rest: 'the Ferrite Union',
    });
  });

  // Le libellé de `faction` est passé à « Group » : un seul mot pour la chose,
  // celui du type d'entité. Le parse tient par ALIAS — sans lui, les fiches
  // saisies « Faction · … » garderaient leur préfixe visible pour toujours,
  // sans jamais être promues vers threat.type (deux lignes en prod le sont).
  it('reads the retired "Faction" label by alias, and answers to the new one', () => {
    expect(MONSTER_KINDS.find((k) => k.key === 'faction')?.name).toBe('Group');
    expect(parseMonsterPrefix('Faction · the Ferrite Union').prefix).toBe('faction');
    expect(parseMonsterPrefix('Group · the Ferrite Union').prefix).toBe('faction');
    // Et l'alias ne vole pas la place d'une autre entrée.
    expect(parseMonsterPrefix('Beast · x').prefix).toBe('beast');
  });
});
