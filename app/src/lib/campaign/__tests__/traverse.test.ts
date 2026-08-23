import { describe, it, expect } from 'vitest';
import { pinPosition, traverse } from '../traverse';
import type { RawCampaignData } from '../types';
import type { Character, Location, Relation, Timeline } from '../../../types';

function char(over: Partial<Character> & Pick<Character, 'id' | 'name' | 'type'>): Character {
  return {
    space_id: 's1',
    role: '',
    notes: '',
    traits: [],
    tags: [],
    gm_only: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Character;
}

function rel(
  over: Partial<Relation> &
    Pick<Relation, 'id' | 'from_character_id' | 'to_character_id' | 'relation_type'>,
): Relation {
  return { space_id: 's1', gm_only: false, created_at: '2026-01-01T00:00:00Z', ...over } as Relation;
}

function loc(over: Partial<Location> & Pick<Location, 'id' | 'name'>): Location {
  return {
    space_id: 's1',
    color: '#7AA177',
    gm_only: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Location;
}

const EMPTY: RawCampaignData = { characters: [], locations: [], relations: [], timeline: null };

describe('traverse — character kinds', () => {
  it('maps Character.type onto kinds', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [
        char({ id: 'c1', name: 'Bhael', type: 'PJ' }),
        char({ id: 'c2', name: 'Rula', type: 'PNJ' }),
        char({ id: 'c3', name: 'The Watch', type: 'GROUPE' }),
        char({ id: 'c4', name: 'Things Below', type: 'MENACE' }),
      ],
    });
    expect(graph.characters.map((c) => c.kind)).toEqual(['pc', 'npc', 'group', 'threat']);
  });

  it('derives the playbook display name from the role prefix', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [
        char({ id: 'c1', name: 'Bhael', type: 'PJ', role: 'Blessed · initiate of Danu' }),
      ],
    });
    expect(graph.characters[0].playbook).toBe('Blessed');
    expect(graph.characters[0].roleRest).toBe('initiate of Danu');
  });

  it('leaves playbook null for a free-text role', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [char({ id: 'c1', name: 'Rula', type: 'PNJ', role: 'innkeeper' })],
    });
    expect(graph.characters[0].playbook).toBeNull();
    expect(graph.characters[0].roleRest).toBe('innkeeper');
  });

  // Notes reach the MCP as Markdown, not flattened text: emphasis, headings and
  // list structure are meaning a planning model should see, and flattening them
  // was silent loss on every read tool.
  it('converts notes and gm_notes to markdown, keeping structure', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [
        char({
          id: 'c1',
          name: 'Rula',
          type: 'PNJ',
          notes: '<p>Keeps the <em>Sunken</em> inn.</p><ul><li>owes Gero</li></ul>',
          gm_notes: '<p>Secretly <strong>indebted</strong>.</p>',
        }),
      ],
    });
    expect(graph.characters[0].notes).toBe('Keeps the *Sunken* inn.\n\n- owes Gero');
    expect(graph.characters[0].gmNotes).toBe('Secretly **indebted**.');
  });

  it('leaves gmNotes empty when the RPC nulled it (non-GM token)', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [char({ id: 'c1', name: 'Rula', type: 'PNJ', gm_notes: null })],
    });
    expect(graph.characters[0].gmNotes).toBe('');
  });
});

describe('traverse — group membership', () => {
  const characters = [
    char({ id: 'g1', name: 'The Watch', type: 'GROUPE' }),
    char({ id: 'g2', name: 'The Guild', type: 'GROUPE' }),
    char({ id: 'c1', name: 'Bhael', type: 'PJ' }),
    char({ id: 'c2', name: 'Rula', type: 'PNJ' }),
  ];

  it('resolves a membre edge with exactly one GROUPE end', () => {
    const graph = traverse({
      ...EMPTY,
      characters,
      relations: [
        rel({ id: 'r1', from_character_id: 'g1', to_character_id: 'c1', relation_type: 'membre' }),
      ],
    });
    const watch = graph.characters.find((c) => c.id === 'g1')!;
    const bhael = graph.characters.find((c) => c.id === 'c1')!;
    expect(watch.members).toEqual(['Bhael']);
    expect(bhael.memberOf).toEqual(['The Watch']);
    expect(graph.membershipRelationIds).toEqual(['r1']);
    expect(graph.relations).toEqual([]);
  });

  it('treats a membre edge between two groups as an ordinary relation', () => {
    const graph = traverse({
      ...EMPTY,
      characters,
      relations: [
        rel({ id: 'r1', from_character_id: 'g1', to_character_id: 'g2', relation_type: 'membre' }),
      ],
    });
    expect(graph.membershipRelationIds).toEqual([]);
    expect(graph.relations.map((r) => r.id)).toEqual(['r1']);
  });

  it('treats a membre edge between two non-groups as an ordinary relation', () => {
    const graph = traverse({
      ...EMPTY,
      characters,
      relations: [
        rel({ id: 'r1', from_character_id: 'c1', to_character_id: 'c2', relation_type: 'membre' }),
      ],
    });
    expect(graph.membershipRelationIds).toEqual([]);
    expect(graph.relations.map((r) => r.id)).toEqual(['r1']);
  });
});

describe('traverse — relations', () => {
  it('joins endpoints, labels the type, and attaches to both characters', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [
        char({ id: 'c1', name: 'Bhael', type: 'PJ' }),
        char({ id: 'c2', name: 'Rula', type: 'PNJ' }),
      ],
      relations: [
        rel({
          id: 'r1',
          from_character_id: 'c1',
          to_character_id: 'c2',
          relation_type: 'ami',
          relation_detail: 'since the boar hunt',
        }),
      ],
    });
    expect(graph.relations[0]).toMatchObject({
      id: 'r1',
      type: 'ami',
      typeLabel: 'Friend / Ally',
      detail: 'since the boar hunt',
      from: { id: 'c1', name: 'Bhael' },
      to: { id: 'c2', name: 'Rula' },
    });
    expect(graph.characters.find((c) => c.id === 'c1')!.relations.map((r) => r.id)).toEqual(['r1']);
    expect(graph.characters.find((c) => c.id === 'c2')!.relations.map((r) => r.id)).toEqual(['r1']);
  });

  it('drops relations whose endpoints are missing', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [char({ id: 'c1', name: 'Bhael', type: 'PJ' })],
      relations: [
        rel({ id: 'r1', from_character_id: 'c1', to_character_id: 'ghost', relation_type: 'ami' }),
      ],
    });
    expect(graph.relations).toEqual([]);
  });

  it('falls back to the Other label for an unknown relation type', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [
        char({ id: 'c1', name: 'A', type: 'PJ' }),
        char({ id: 'c2', name: 'B', type: 'PJ' }),
      ],
      relations: [
        rel({ id: 'r1', from_character_id: 'c1', to_character_id: 'c2', relation_type: 'nonsense' }),
      ],
    });
    expect(graph.relations[0].typeLabel).toBe('Other');
  });
});

describe('traverse — locations', () => {
  it('lists inhabitants and keeps the steading block', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [char({ id: 'c1', name: 'Bhael', type: 'PJ', location: 'l1' })],
      locations: [
        loc({
          id: 'l1',
          name: 'Stonetop',
          description: 'hill town',
          notes: '<p>Founded on ruins.</p>',
        }),
      ],
    });
    expect(graph.locations[0]).toMatchObject({
      name: 'Stonetop',
      description: 'hill town',
      notes: 'Founded on ruins.',
      inhabitants: ['Bhael'],
    });
    expect(graph.characters[0].locationName).toBe('Stonetop');
  });

  it('leaves locationName null when a character has no location', () => {
    const graph = traverse({ ...EMPTY, characters: [char({ id: 'c1', name: 'Bhael', type: 'PJ' })] });
    expect(graph.characters[0].locationName).toBeNull();
  });
});

describe('traverse — chronicle', () => {
  const timeline: Timeline = {
    id: 't1',
    space_id: 's1',
    entries: {
      '0': {
        autumn: { title: 'The Ambush', body: '<p>They came at dusk.</p>' },
        spring: '<p>Thaw.</p>',
      },
      '-1': { winter: '<p>Hungry months.</p>' },
    },
    gm_entries: { '0': { autumn: '<p>The cult moved first.</p>' } },
    current_year: 0,
    current_season: 'autumn',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('orders ascending by year then season, player strand before gm', () => {
    const graph = traverse({ ...EMPTY, timeline });
    expect(graph.chronicle.map((e) => [e.year, e.season, e.strand])).toEqual([
      [-1, 'winter', 'player'],
      [0, 'spring', 'player'],
      [0, 'autumn', 'player'],
      [0, 'autumn', 'gm'],
    ]);
  });

  it('normalizes titles and converts bodies to text', () => {
    const graph = traverse({ ...EMPTY, timeline });
    const ambush = graph.chronicle.find((e) => e.season === 'autumn' && e.strand === 'player')!;
    expect(ambush.title).toBe('The Ambush');
    expect(ambush.body).toBe('They came at dusk.');
    const legacy = graph.chronicle.find((e) => e.season === 'spring')!;
    expect(legacy.title).toBe('');
    expect(legacy.body).toBe('Thaw.');
  });

  it('exposes the current season marker', () => {
    expect(traverse({ ...EMPTY, timeline }).now).toEqual({ year: 0, season: 'autumn' });
  });

  it('handles a null timeline', () => {
    const graph = traverse(EMPTY);
    expect(graph.chronicle).toEqual([]);
    expect(graph.now).toEqual({ year: null, season: null });
  });

  it('omits the gm strand when the RPC nulled it (non-GM token)', () => {
    const graph = traverse({ ...EMPTY, timeline: { ...timeline, gm_entries: null } });
    expect(graph.chronicle.every((e) => e.strand === 'player')).toBe(true);
  });
});

describe('traverse — gm journal', () => {
  it('resolves the gm journal, converting notes to markdown', () => {
    const graph = traverse({
      ...EMPTY,
      gmJournal: {
        id: 'j1',
        space_id: 's1',
        notes: '<p>secret <b>plans</b></p>',
        updated_at: '',
        wonders: [
          { id: 'w1', text: 'I wonder A', resolved: false, created_at: '' },
          { id: 'w2', text: 'I wonder B', resolved: true, resolution: 'It was the crows', created_at: '' },
        ],
      },
    });
    expect(graph.journal).toEqual({
      notes: 'secret **plans**',
      wonders: [
        { text: 'I wonder A', resolved: false, resolution: '' },
        { text: 'I wonder B', resolved: true, resolution: 'It was the crows' },
      ],
    });
  });

  it('yields a null journal when the producer supplied none', () => {
    expect(traverse(EMPTY).journal).toBeNull();
  });
});

describe('traverse — maps', () => {
  const map = {
    id: 'map1',
    space_id: 's1',
    name: 'The Vale',
    location_id: 'l1',
    gm_only: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  const pin = (over: Partial<import('../../../types').MapPin> & { id: string }) => ({
    map_id: 'map1',
    space_id: 's1',
    x: 0.5,
    y: 0.5,
    gm_only: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  });

  it('resolves empty when the producer supplied no maps', () => {
    expect(traverse(EMPTY).maps).toEqual([]);
  });

  it('names pins from their linked entity, falling back to the label', () => {
    const graph = traverse({
      ...EMPTY,
      characters: [char({ id: 'c1', name: 'Bhael', type: 'PJ' })],
      locations: [loc({ id: 'l1', name: 'Stonetop' })],
      maps: [map],
      mapPins: [
        pin({ id: 'p1', character_id: 'c1' }),
        pin({ id: 'p2', location_id: 'l1' }),
        pin({ id: 'p3', label: 'Buried shrine' }),
        pin({ id: 'p4' }), // dangling: no link, no label — dropped
      ],
    });
    expect(graph.maps).toHaveLength(1);
    expect(graph.maps[0].locationName).toBe('Stonetop');
    expect(graph.maps[0].pins.map((p) => p.name)).toEqual(['Bhael', 'Stonetop', 'Buried shrine']);
  });

  it('words pin positions from normalized coordinates', () => {
    expect(pinPosition(0.1, 0.1)).toBe('north-west');
    expect(pinPosition(0.9, 0.9)).toBe('south-east');
    expect(pinPosition(0.5, 0.5)).toBe('center');
    expect(pinPosition(0.5, 0.1)).toBe('north');
    expect(pinPosition(0.9, 0.5)).toBe('east');
  });
});

describe('discovery rows', () => {
  it('maps type DISCOVERY onto kind discovery, keeping role as the subtype', () => {
    const graph = traverse({
      characters: [
        {
          id: 'd1', space_id: 's1', name: 'The bronze plate', type: 'DISCOVERY',
          role: 'arcanum', instinct: '', notes: '', gm_notes: null,
          traits: [{ label: 'dig it up & clean it', checked: false }],
          tags: [], gm_only: true, dead: false, kind: null, threat: null,
          statblock: null, follower: null,
          created_at: '2026-08-17T00:00:00Z', updated_at: '2026-08-17T00:00:00Z',
        },
      ],
      locations: [],
      relations: [],
      timeline: null,
    });
    expect(graph.characters[0].kind).toBe('discovery');
    expect(graph.characters[0].role).toBe('arcanum');
  });
});
