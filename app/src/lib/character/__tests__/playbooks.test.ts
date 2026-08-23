import { describe, it, expect } from 'vitest';
import { PLAYBOOKS, parseRole, composeRole } from '../playbooks';

describe('parseRole', () => {
  it('décompose « Livret · reste »', () => {
    expect(parseRole('Blessed · initiate of Danu')).toEqual({
      playbook: 'blessed',
      rest: 'initiate of Danu',
    });
  });

  it('reconnaît le nom seul, la casse et le « The » d’usage', () => {
    expect(parseRole('blessed').playbook).toBe('blessed');
    expect(parseRole('The Lightbearer').playbook).toBe('lightbearer');
    expect(parseRole('would-be hero').playbook).toBe('wouldbehero');
    expect(parseRole('Would Be Hero').playbook).toBe('wouldbehero');
  });

  it('laisse intact un rôle libre sans livret', () => {
    expect(parseRole('Forgeron')).toEqual({ playbook: null, rest: 'Forgeron' });
    expect(parseRole('Aubergiste · ivrogne')).toEqual({
      playbook: null,
      rest: 'Aubergiste · ivrogne',
    });
    expect(parseRole('')).toEqual({ playbook: null, rest: '' });
    expect(parseRole('  ')).toEqual({ playbook: null, rest: '' });
  });

  it('fait l’aller-retour avec composeRole pour chaque livret', () => {
    for (const { key } of PLAYBOOKS) {
      expect(parseRole(composeRole(key, 'un détail'))).toEqual({
        playbook: key,
        rest: 'un détail',
      });
      expect(parseRole(composeRole(key, ''))).toEqual({ playbook: key, rest: '' });
    }
  });
});

describe('composeRole', () => {
  it('compose le format « Livret · reste »', () => {
    expect(composeRole('blessed', 'initiate of Danu')).toBe('Blessed · initiate of Danu');
    expect(composeRole('wouldbehero', '')).toBe('Would-Be Hero');
    expect(composeRole(null, 'Forgeron')).toBe('Forgeron');
    expect(composeRole(null, '')).toBe('');
  });
});
