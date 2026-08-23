import { describe, expect, it } from 'vitest';
import type { Location, Relation } from '../../../../../types';
import { parseLocation, writeLocation } from '../location';
import { parseRelations, writeRelations } from '../relations';
import type { VaultContext } from '../../context';

const ctx: VaultContext = {
  nameById: new Map([
    ['c1', 'Ana'],
    ['c2', 'Gero'],
  ]),
  idByName: new Map([
    ['Ana', 'c1'],
    ['Gero', 'c2'],
  ]),
};

const STEADING: Location = {
  id: 'loc-1',
  space_id: '',
  name: 'Stonetop',
  color: '#7AA177',
  description: 'marsh trading town',
  notes: '<p>Founded on <em>ruins</em>.</p>',
  tags: ['home'],
  gm_only: false,
  gm_notes: '<p>The crypt is not empty.</p>',
  created_at: '2026-05-14T20:29:30Z',
  steading: {
    size: 'village',
    stats: { fortunes: 1, population: 2, prosperity: -1, defenses: 0, surplus: 3 },
    debilities: { diminished: true, lacking: false, malcontent: true },
    resources: ['Timber', 'Grain'],
    fortifications: ['Palisade'],
    assets: ['The Forge'],
    treasury: {
      silver: { purses: 1, handfuls: 2, coins: 3 },
      gold: { purses: 0, handfuls: 1, coins: 0 },
    },
    improvements: [
      {
        id: 'mill',
        name: 'Mill',
        summary: 'Grinds grain for the valley.',
        requirements: [
          { text: 'Pull Together ×5', done: false, progress: 3 },
          { text: 'A miller', done: true },
        ],
        effects: '+1 prosperity',
        completed: false,
        custom: false,
      },
      {
        id: 'custom-9',
        name: 'Beet cellar',
        summary: 'Keeps the harvest.',
        requirements: [],
        effects: '',
        completed: true,
        custom: true,
      },
    ],
  },
};

describe('location notes', () => {
  it('round-trips a maximal steading', () => {
    expect(parseLocation(writeLocation(STEADING, ctx))).toEqual(STEADING);
  });

  it('is byte-idempotent', () => {
    const once = writeLocation(STEADING, ctx);
    expect(writeLocation(parseLocation(once), ctx)).toBe(once);
  });

  it('round-trips a plain location with no steading', () => {
    const plain: Location = {
      id: 'loc-2', space_id: '', name: 'The Ford', color: '#333333',
      description: undefined, notes: '', tags: [], gm_only: true,
      gm_notes: null, steading: null, created_at: '2026-01-01T00:00:00Z',
    };
    expect(parseLocation(writeLocation(plain, ctx))).toEqual(plain);
  });

  it('keeps repeatable requirement progress as (n/total)', () => {
    expect(writeLocation(STEADING, ctx)).toContain('Pull Together ×5 (3/5)');
  });

  it('puts only the size in frontmatter, the numbers in the body', () => {
    const md = writeLocation(STEADING, ctx);
    expect(md).toContain('steading_size: village');
    expect(md).not.toContain('steading_population');
  });
});

describe('relations table', () => {
  const RELATIONS: Relation[] = [
    {
      id: 'r1', space_id: '', from_character_id: 'c1', to_character_id: 'c2',
      relation_type: 'ami', relation_detail: 'since the boar hunt',
      gm_only: false, created_at: '2026-05-14T20:29:30Z',
    },
    {
      id: 'r2', space_id: '', from_character_id: 'c2', to_character_id: 'c1',
      relation_type: 'membre', relation_detail: undefined,
      gm_only: true, created_at: '2026-06-01T00:00:00Z',
    },
  ];

  it('round-trips', () => {
    expect(parseRelations(writeRelations(RELATIONS, ctx), ctx)).toEqual(RELATIONS);
  });

  it('is byte-idempotent', () => {
    const once = writeRelations(RELATIONS, ctx);
    expect(writeRelations(parseRelations(once, ctx), ctx)).toBe(once);
  });

  it('survives a pipe in the detail text', () => {
    const piped: Relation[] = [{ ...RELATIONS[0], relation_detail: 'owes a debt | never repaid' }];
    expect(parseRelations(writeRelations(piped, ctx), ctx)).toEqual(piped);
  });

  it('accepts a hand-added row with no id or created', () => {
    const md = `${HEADERS}\n| [[Ana]] | ennemi | [[Gero]] |  |  |  |  |\n`;
    const [rel] = parseRelations(md, ctx);
    expect(rel).toMatchObject({
      from_character_id: 'c1', to_character_id: 'c2', relation_type: 'ennemi', id: '',
    });
  });

  it('emits raw ids when the endpoints are not in this export', () => {
    const lonely: VaultContext = { nameById: new Map(), idByName: new Map() };
    expect(writeRelations(RELATIONS, lonely)).toContain('| c1 | ami | c2 |');
  });
});

const HEADERS = '| From | Type | To | Detail | GM | id | created |\n|---|---|---|---|---|---|---|';
