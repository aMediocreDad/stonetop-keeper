import { describe, expect, it } from 'vitest';
import { THREAT_TYPES, legacyThreatRole, threatTypeOf } from '../threatTypes';

describe('legacyThreatRole', () => {
  it('maps the two unambiguous legacy prefixes (middle-dot separator)', () => {
    expect(legacyThreatRole('Beast · the hagr of the wood'))
      .toEqual({ type: 'beast', rest: 'the hagr of the wood' });
    expect(legacyThreatRole('Faction · the Ferrite Union'))
      .toEqual({ type: 'institution', rest: 'the Ferrite Union' });
  });

  it('preserves unmapped prefixes as visible role text, type null', () => {
    expect(legacyThreatRole('Spirit · the weeping mist'))
      .toEqual({ type: null, rest: 'Spirit · the weeping mist' });
  });

  it('handles prefix-less and empty roles', () => {
    expect(legacyThreatRole('just a villain')).toEqual({ type: null, rest: 'just a villain' });
    expect(legacyThreatRole('')).toEqual({ type: null, rest: '' });
  });
});

describe('threatTypeOf', () => {
  it('threat.type wins; falls back to the legacy prefix; null otherwise', () => {
    expect(threatTypeOf({ role: 'Beast · hagr', threat: { type: 'villain' } as never })).toBe('villain');
    expect(threatTypeOf({ role: 'Beast · hagr', threat: null })).toBe('beast');
    expect(threatTypeOf({ role: 'the drought' })).toBeNull();
  });
});

describe('THREAT_TYPES', () => {
  it("is the book's 8-type list", () => {
    expect(THREAT_TYPES.map((t) => t.key)).toEqual([
      'affliction', 'beast', 'institution', 'macguffin',
      'magical-entity', 'rabble', 'villain', 'wildcard',
    ]);
  });
});
