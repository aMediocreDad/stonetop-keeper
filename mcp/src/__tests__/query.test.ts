import { describe, expect, it } from 'vitest';
import { traverse } from '../../../app/src/lib/shared';
import type { RawCampaignData } from '../../../app/src/lib/shared';
import { searchGraph } from '../query';

/** The row type, taken from the seam's own shape rather than widening the seam
 *  with an export only a test needs. */
type CharacterRow = RawCampaignData['characters'][number];

/**
 * Search runs over the MARKDOWN a note becomes, not the HTML it is stored as,
 * so it has to undo the writer's escaping before it matches. A GM searching for
 * a word they typed must not be defeated by punctuation the converter had to
 * protect on the way out.
 */

function character(notes: string): CharacterRow {
  return {
    id: 'c1', space_id: 's1', name: 'Ana', type: 'PJ', role: '', instinct: '',
    notes, gm_notes: null, traits: [], tags: [], gm_only: false, dead: false,
    kind: null, threat: null, statblock: null, follower: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

function graphWith(notes: string) {
  const raw: RawCampaignData = {
    characters: [character(notes)],
    locations: [], relations: [], timeline: null, maps: [], mapPins: [], gmJournal: null,
  };
  return traverse(raw);
}

describe('search over Markdown notes', () => {
  // `escapeMarkdown` writes these as `snake\_case`, `2 \* 3` and `\[x\]`.
  // Stripping delimiters without undoing the escape left the backslash behind,
  // and every one of these searches came back empty.
  it.each([
    ['snake_case', '<p>Uses snake_case throughout.</p>'],
    ['2 * 3', '<p>The rule is 2 * 3 dice.</p>'],
    ['[x]', '<p>Marked [x] on the map.</p>'],
  ])('finds %s in prose that had to be escaped', (needle, notes) => {
    const hits = searchGraph(graphWith(notes), needle);
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain(needle);
  });

  it('still matches across emphasis, which is markup and not text', () => {
    const hits = searchGraph(graphWith('<p>The <strong>drowned</strong> road.</p>'), 'drowned road');
    expect(hits).toHaveLength(1);
  });

  it('strips a heading marker at any depth the writer emits', () => {
    const hits = searchGraph(graphWith('<h2>Rumours</h2><p>at the bar</p>'), 'Rumours');
    expect(hits[0].snippet.startsWith('#')).toBe(false);
  });
});

describe('searching the bench', () => {
  /** Same shape as `character()` above, but for a DISCOVERY row with a subtype. */
  function discoveryChar(over: Partial<CharacterRow> & Pick<CharacterRow, 'id' | 'name'>): CharacterRow {
    return { ...character(''), type: 'DISCOVERY', role: 'artifact', ...over };
  }

  const bench = () =>
    traverse({
      characters: [
        discoveryChar({ id: 'd1', name: 'The bronze plate' }),
        // Also matches "the", to prove the kind filter actually excludes a
        // non-discovery hit rather than passing on an empty result set.
        { ...character('<p>the old feud</p>'), id: 'c1', name: 'Rula', type: 'PNJ' },
      ],
      locations: [], relations: [], timeline: null, maps: [], mapPins: [], gmJournal: null,
    });

  it('covers discoveries, and finds one by its subtype', () => {
    // searchGraph's haystack already includes c.role, so a query for
    // "artifact" finds artifacts the moment the subtype lives there.
    const hits = searchGraph(bench(), 'artifact');
    expect(hits.map((h) => h.kind)).toContain('discovery');
  });

  it('can be narrowed to discoveries alone', () => {
    const graph = bench();
    expect(searchGraph(graph, 'the').length).toBeGreaterThan(1);
    const narrowed = searchGraph(graph, 'the', ['discovery']);
    // Not just "every hit happens to be a discovery" (vacuously true on an
    // empty array) — the filter must actually keep the one there is.
    expect(narrowed).toHaveLength(1);
    expect(narrowed.every((h) => h.kind === 'discovery')).toBe(true);
  });
});
