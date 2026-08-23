import { describe, it, expect } from 'vitest';
import {
  searchFields,
  fold,
  matchCharacter,
  searchTerms,
  snippetAround,
} from '../characterSearch';
import type { Character } from '../../../types';

function char(over: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    space_id: 's1',
    name: 'Cadmor',
    role: 'village blacksmith',
    instinct: 'keep the forge lit',
    type: 'PJ',
    notes: '',
    traits: [],
    tags: [],
    gm_only: false,
    dead: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const NO_PLACE = '';

describe('fold', () => {
  it('strips case and diacritics', () => {
    expect(fold('Övna')).toBe('ovna');
    expect(fold('Éowyn')).toBe('eowyn');
  });
});

describe('searchTerms', () => {
  it('splits on whitespace and dedupes', () => {
    expect(searchTerms('  Miller   WIDOW miller ')).toEqual(['miller', 'widow']);
  });

  it('is empty for blank queries', () => {
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('searchFields', () => {
  it('covers attributes and prose, HTML stripped', () => {
    const c = char({
      tags: ['stealthy'],
      traits: [{ label: 'sharp-tongued', checked: false }],
      notes: '<p>Owes the party a <strong>debt</strong>.</p>',
      gm_notes: '<p>Secretly a spy.</p>',
      statblock: {
        hp: 10,
        armor: 1,
        armorNote: 'thick hides',
        damage: 'hammer d6+2',
        specialQualities: 'never tires',
        moves: ['Douse the forge'],
      },
      threat: {
        instinct: 'to smother the flame',
        portents: [{ text: '<p>The well runs dry.</p>', done: false }],
        impendingDoom: { text: '<p>The valley starves.</p>', done: false },
        stakes: [{ text: '<p>Who will break first?</p>', done: false }],
        gmMoves: ['Foul the water'],
      },
    });

    const byField = new Map(searchFields(c).map((f) => [f.field, f.text]));
    expect(byField.get('name')).toBe('Cadmor');
    expect(byField.get('role')).toBe('village blacksmith');
    expect(byField.get('instinct')).toBe('keep the forge lit');
    expect(byField.get('tag')).toBe('stealthy');
    expect(byField.get('trait')).toBe('sharp-tongued');
    expect(byField.get('notes')).toBe('Owes the party a debt.');
    expect(byField.get('gmNotes')).toBe('Secretly a spy.');

    const threat = searchFields(c).filter((f) => f.field === 'threat').map((f) => f.text);
    expect(threat).toEqual(
      expect.arrayContaining([
        'The valley starves.',
        'The well runs dry.',
        'Who will break first?',
        'Foul the water',
      ])
    );
    const stats = searchFields(c).filter((f) => f.field === 'stats').map((f) => f.text);
    expect(stats).toEqual(
      expect.arrayContaining(['hammer d6+2', 'thick hides', 'never tires', 'Douse the forge'])
    );
  });

  it('reads the legacy threat.instinct when the column is empty', () => {
    const c = char({
      type: 'MENACE',
      instinct: '',
      threat: {
        instinct: 'smother every flame',
        portents: [],
        impendingDoom: { text: '', done: false },
        stakes: [],
        gmMoves: [],
      },
    });
    const instincts = searchFields(c).filter((f) => f.field === 'instinct').map((f) => f.text);
    expect(instincts).toEqual(['smother every flame']);
  });

  it('survives a threat block with missing keys (restored revision)', () => {
    const c = char({ type: 'MENACE', threat: { instinct: 'lurk' } as never });
    expect(() => searchFields(c)).not.toThrow();
  });

  it('caches per character object', () => {
    const c = char();
    expect(searchFields(c)).toBe(searchFields(c));
  });
});

describe('matchCharacter', () => {
  it('matches a name, and ranks it first', () => {
    const m = matchCharacter(char(), NO_PLACE, searchTerms('cadmor'));
    expect(m).toMatchObject({ rank: 0, field: 'name' });
    expect(m?.explain).toBeUndefined();
  });

  it('folds diacritics on both sides', () => {
    expect(matchCharacter(char({ name: 'Övna' }), NO_PLACE, searchTerms('ovna'))).not.toBeNull();
    expect(matchCharacter(char({ name: 'Ovna' }), NO_PLACE, searchTerms('övna'))).not.toBeNull();
  });

  it('requires every term (AND), across different fields', () => {
    const c = char({ name: 'Eurwen', role: "the miller's widow" });
    expect(matchCharacter(c, NO_PLACE, searchTerms('miller widow'))).not.toBeNull();
    expect(matchCharacter(c, NO_PLACE, searchTerms('eurwen widow'))).not.toBeNull();
    expect(matchCharacter(c, NO_PLACE, searchTerms('miller smith'))).toBeNull();
  });

  it('matches the location name passed in', () => {
    const m = matchCharacter(char(), 'Stonetop', searchTerms('stonetop'));
    expect(m).toMatchObject({ rank: 1, field: 'location' });
  });

  it('returns null on an empty query', () => {
    expect(matchCharacter(char(), NO_PLACE, searchTerms(''))).toBeNull();
  });

  it('explains a prose-only match with a snippet', () => {
    const c = char({
      notes: '<p>She owes the party a debt for the winter grain, and has not paid it.</p>',
    });
    const m = matchCharacter(c, NO_PLACE, searchTerms('debt'));
    expect(m?.rank).toBe(2);
    expect(m?.explain?.field).toBe('notes');
    expect(m?.explain?.snippet).toContain('debt');
    const { snippet, start, end } = m!.explain!;
    expect(snippet.slice(start, end)).toBe('debt');
  });

  it('labels the prose field it came from', () => {
    const gm = char({ gm_notes: '<p>Secretly a spy for the Crow.</p>' });
    expect(matchCharacter(gm, NO_PLACE, searchTerms('spy'))?.explain?.field).toBe('gmNotes');

    const threat = char({
      type: 'MENACE',
      threat: {
        instinct: '',
        portents: [{ text: '<p>The well runs dry.</p>', done: false }],
        impendingDoom: { text: '', done: false },
        stakes: [],
        gmMoves: [],
      },
    });
    expect(matchCharacter(threat, NO_PLACE, searchTerms('well'))?.explain?.field).toBe('threat');
  });

  it('says nothing when a visible field already explains the match', () => {
    // « forge » vit dans l'instinct (peint sur la carte) : rien à expliquer.
    const m = matchCharacter(char(), NO_PLACE, searchTerms('cadmor forge'));
    expect(m?.rank).toBe(0);
    expect(m?.explain).toBeUndefined();
  });

  it('explains the most obscure term, and still ranks on the best one', () => {
    const c = char({ notes: '<p>Keeps a ledger of every favour owed.</p>' });
    const m = matchCharacter(c, NO_PLACE, searchTerms('cadmor ledger'));
    expect(m?.rank).toBe(0);
    expect(m?.field).toBe('name');
    expect(m?.explain?.field).toBe('notes');
    expect(m?.explain?.snippet).toContain('ledger');
  });
});

describe('snippetAround', () => {
  it('collapses prose to one line', () => {
    const s = snippetAround('First line.\n\nSecond line mentions grain.', 'grain');
    expect(s?.snippet).not.toContain('\n');
  });

  it('marks the term even after a diacritic shifts the offsets', () => {
    const s = snippetAround('Övna and Éowyn both mention the grain tithe.', 'grain');
    expect(s?.snippet.slice(s.start, s.end)).toBe('grain');
  });

  it('trims long prose with ellipses and keeps whole words', () => {
    const long =
      'The village had kept the same bargain for nine generations, and every autumn ' +
      'the millers brought their tithe of grain to the hall, where it was counted ' +
      'twice and entered in the ledger before anyone was allowed to eat.';
    const s = snippetAround(long, 'ledger');
    expect(s).not.toBeNull();
    expect(s!.snippet.startsWith('…')).toBe(true);
    expect(s!.snippet.slice(s!.start, s!.end)).toBe('ledger');
    expect(s!.snippet.length).toBeLessThan(long.length);
    // L'extrait commence sur une frontière de mot : son premier mot existe
    // tel quel dans la source, précédé d'une espace (donc pas amputé).
    const first = s!.snippet.replace(/^…/, '').split(' ')[0];
    expect(long).toContain(` ${first} `);
  });

  it('is null when the term is absent', () => {
    expect(snippetAround('nothing here', 'grain')).toBeNull();
  });
});
