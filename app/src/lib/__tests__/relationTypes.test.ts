import { describe, expect, it } from 'vitest';
import type { CharacterType } from '../../types';
import {
  RELATION_TYPES,
  STRUCTURAL_RELATION_IDS,
  getRelationType,
  relationTypesForPair,
} from '../constants';

const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe('the structural relation types', () => {
  it('resolve like any other id, with their own colour', () => {
    for (const id of STRUCTURAL_RELATION_IDS) {
      const rt = getRelationType(id);
      expect(rt.id).toBe(id);
      expect(rt.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps "Other" last so the picker still ends where it did', () => {
    expect(RELATION_TYPES[RELATION_TYPES.length - 1].id).toBe('autre');
  });
});

describe('relationTypesForPair', () => {
  it('offers only social types between two ordinary entries', () => {
    const offered = ids(relationTypesForPair('PJ', 'PJ'));
    expect(offered).toContain('romance');
    expect(offered).not.toContain('leads-to');
    expect(offered).not.toContain('found-with');
    expect(offered).not.toContain('concerns');
  });

  it('offers structural types and Other — and no social ones — when an end is a discovery', () => {
    const offered = ids(relationTypesForPair('DISCOVERY', 'PNJ'));
    expect(offered).toEqual(
      ['leads-to', 'found-with', 'concerns', 'held-by', 'encounter-with', 'autre'],
    );
    // Direction must not matter: the picker is about the pair, not the subject.
    expect(ids(relationTypesForPair('PNJ', 'DISCOVERY'))).toEqual(offered);
  });

  it('resolves a DISCOVERY+MENACE pair to discovery-only behaviour (both ends matching at once)', () => {
    // Branch order in relationTypesForPair tests `hasDiscovery` before
    // `hasMenace`, so a pair where BOTH match resolves to the discovery-only
    // set (found-with, held-by, and encounter-with all included) rather than
    // the menace-only set (all three excluded) — those three are the
    // discriminating elements. Nothing pinned this, so a future reordering of
    // those two branches would pass silently.
    const offered = ids(relationTypesForPair('DISCOVERY', 'MENACE'));
    expect(offered).toEqual(
      ['leads-to', 'found-with', 'concerns', 'held-by', 'encounter-with', 'autre'],
    );
    expect(ids(relationTypesForPair('MENACE', 'DISCOVERY'))).toEqual(offered);
  });

  it('lets a threat use leads-to and concerns, but not found-with', () => {
    const offered = ids(relationTypesForPair('MENACE', 'PNJ'));
    expect(offered).toContain('leads-to');
    expect(offered).toContain('concerns');
    expect(offered).not.toContain('found-with'); // an object relation, not a threat one
    expect(offered).toContain('ennemi'); // the social ten stay
  });

  it('offers everything when an endpoint type is unknown', () => {
    // A relation whose other end has not loaded yet must not silently narrow.
    expect(ids(relationTypesForPair('PJ', undefined))).toEqual(ids(RELATION_TYPES));
  });

  it('keeps a stored value offered even when the pair would not allow it', () => {
    // Re-typing an endpoint degrades a lead to a labelled edge; the edit
    // select must still show what is stored rather than going blank.
    const offered = ids(relationTypesForPair('PJ', 'PJ', 'leads-to'));
    expect(offered).toContain('leads-to');
    expect(offered.indexOf('leads-to')).toBeGreaterThan(offered.indexOf('membre'));
  });

  it('ignores an unknown keepId rather than inventing an option', () => {
    expect(ids(relationTypesForPair('PJ', 'PJ', 'vieil-ami-du-village')))
      .toEqual(ids(relationTypesForPair('PJ', 'PJ')));
  });
});

describe('held-by and encounter-with', () => {
  const ids = (from: CharacterType | undefined, to: CharacterType | undefined, keep?: string) =>
    relationTypesForPair(from, to, keep).map((r) => r.id);

  it('are structural, so a discovery pair offers them', () => {
    expect(ids('DISCOVERY', 'PNJ')).toEqual(
      ['leads-to', 'found-with', 'concerns', 'held-by', 'encounter-with', 'autre'],
    );
  });

  it('offers a discovery pair none of the social ten', () => {
    expect(ids('DISCOVERY', 'PJ')).not.toContain('romance');
    expect(ids('DISCOVERY', 'PJ')).not.toContain('ami');
  });

  it('does NOT offer them on a threat pair — only leads-to and concerns', () => {
    const menace = ids('MENACE', 'PNJ');
    expect(menace).toContain('leads-to');
    expect(menace).toContain('concerns');
    expect(menace).not.toContain('held-by');
    expect(menace).not.toContain('encounter-with');
    expect(menace).not.toContain('found-with');
    expect(menace).toContain('ami'); // the social ten stay
  });

  it('offers an ordinary pair no structural type at all', () => {
    const pair = ids('PJ', 'PNJ');
    expect(pair).not.toContain('held-by');
    expect(pair).not.toContain('encounter-with');
    expect(pair).not.toContain('leads-to');
  });

  it('keeps a stored value that the pair would not otherwise offer', () => {
    expect(ids('PJ', 'PNJ', 'held-by')).toContain('held-by');
  });

  it('offers everything while an end is still loading', () => {
    expect(ids('DISCOVERY', undefined)).toContain('romance');
  });

  it('resolves the new ids rather than falling back to autre', () => {
    expect(getRelationType('held-by').id).toBe('held-by');
    expect(getRelationType('encounter-with').id).toBe('encounter-with');
  });
});
