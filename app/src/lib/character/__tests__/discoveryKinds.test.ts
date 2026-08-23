import { describe, expect, it } from 'vitest';
import { DISCOVERY_KINDS, discoveryKindLabel, getDiscoveryKind } from '../discoveryKinds';

describe('getDiscoveryKind', () => {
  it('round-trips every listed id', () => {
    for (const k of DISCOVERY_KINDS) {
      expect(getDiscoveryKind(k.id)).toBe(k.id);
    }
  });

  it('returns null for the empty role a subtype-less create produces', () => {
    // `role` is NOT NULL DEFAULT '' and create_character coalesces a missing
    // key to '' — "unfiled" is a real state, not an error.
    expect(getDiscoveryKind('')).toBeNull();
    expect(getDiscoveryKind(undefined)).toBeNull();
  });

  it('returns null for an unrecognised value instead of throwing', () => {
    // A restored revision or a hand-written MCP payload can carry anything,
    // including another type's role text.
    expect(getDiscoveryKind('Blessed · Initiate')).toBeNull();
    expect(getDiscoveryKind('CLUE')).toBeNull(); // ids are lowercase, exact
  });

  it('lists the seven kinds alphabetically', () => {
    expect(DISCOVERY_KINDS.map((k) => k.id)).toEqual([
      'arcanum', 'artifact', 'clue', 'encounter', 'opportunity', 'revelation', 'site',
    ]);
  });

  it('stays sorted by LABEL, which is what a reader scans', () => {
    // The rule, not just today's values: the array above pins the current
    // seven, this pins where an eighth would have to go. Sorted on `label`
    // rather than `id` because the label is what renders — they agree today
    // and a future kind whose id and label diverge must follow the label.
    const labels = DISCOVERY_KINDS.map((k) => k.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('gives every kind an i18n key under discovery.*', () => {
    for (const k of DISCOVERY_KINDS) {
      expect(k.labelKey).toBe(`discovery.${k.id}`);
      expect(k.label).not.toBe('');
    }
  });
});

describe('revelation', () => {
  it('is a kind, and the list is seven long', () => {
    expect(getDiscoveryKind('revelation')).toBe('revelation');
    expect(DISCOVERY_KINDS).toHaveLength(7);
  });

  it('is an ordinary member of the list, not a special first entry', () => {
    // It used to sit second, right after `clue`, because the book works
    // backwards from a revelation to its clues. The list is alphabetical now
    // (owner's call), so adjacency is gone — what still matters is that
    // `revelation` is a normal kind and never the default the picker lands on.
    const ids = DISCOVERY_KINDS.map((k) => k.id);
    expect(ids).toContain('revelation');
    expect(ids[0]).not.toBe('revelation');
  });

  it('labels for consumers with no React context', () => {
    expect(discoveryKindLabel('revelation')).toBe('Revelation');
  });

  it('still reports an unrecognised role as unfiled', () => {
    expect(getDiscoveryKind('revelations')).toBeNull();
    expect(discoveryKindLabel('')).toBe('Discovery');
  });
});
