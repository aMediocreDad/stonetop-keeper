import { describe, it, expect } from 'vitest';
import { normalizeDiscovery, discoveryBlockOf, parseMoveBody } from '../discoveryBlock';

describe('normalizeDiscovery', () => {
  it('returns null for a non-object', () => {
    expect(normalizeDiscovery(null)).toBeNull();
    expect(normalizeDiscovery('junk')).toBeNull();
    expect(normalizeDiscovery(42)).toBeNull();
    expect(normalizeDiscovery([])).toBeNull();
  });

  it('round-trips a full block', () => {
    const block = {
      tier: 'major' as const,
      interesting: 'a maker sigil',
      useful: 'the device is nearby',
      moves: [{ name: 'Inflame', tags: 'near, magical', text: 'When you...' }],
      tracks: [{ label: 'Charges', max: 3, marked: 2 }],
      mysteries: [{ name: 'Burning Hatred', text: 'When you...', gained: true }],
      consequences: [{ label: 'Your skin becomes feverish', checked: false }],
    };
    expect(normalizeDiscovery(block)).toEqual(block);
  });

  it('drops keys it does not know', () => {
    const out = normalizeDiscovery({ tier: 'minor', hp: 6, statblock: {} });
    expect(out).toEqual({ tier: 'minor' });
  });

  it('drops an unrecognised tier rather than guessing', () => {
    expect(normalizeDiscovery({ tier: 'legendary' })).toEqual({});
  });

  // Load-bearing, not a tautology: update_character coerces a non-object
  // non-GM write payload to '{}'::jsonb before re-grafting GM-held keys
  // (supabase-discovery-block.sql:212-215), so this exact input is reachable
  // in production whenever a non-GM player clears the block. It must read
  // back as "block present, empty" (out = {}), never "no block" (null) — a
  // future edit must not collapse this into the tier case above, which is
  // testing a different rule (tier validation, not the empty-object floor).
  it('returns an empty block for {}, never null — a non-GM clear lands {} server-side', () => {
    expect(normalizeDiscovery({})).toEqual({});
    expect(normalizeDiscovery({})).not.toBeNull();
  });

  it('clamps marked into 0..max', () => {
    const out = normalizeDiscovery({
      tracks: [
        { label: 'over', max: 3, marked: 9 },
        { label: 'under', max: 3, marked: -2 },
        { label: 'garbage', max: 'x', marked: 'y' },
      ],
    });
    expect(out?.tracks).toEqual([
      { label: 'over', max: 3, marked: 3 },
      { label: 'under', max: 3, marked: 0 },
      { label: 'garbage', max: 0, marked: 0 },
    ]);
  });

  it('drops the blank row MovesEditor appends, which the exporter cannot represent', () => {
    // `{name:'',text:''}` is exactly what "Add a move" creates. Exported it
    // became a bare `###`, which the section regex does not match — the move
    // vanished on re-import and welded a stray `###` onto the previous move.
    const out = normalizeDiscovery({ moves: [{ name: 'Inflame', text: 'A' }, { name: '', text: '' }] });
    expect(out?.moves).toEqual([{ name: 'Inflame', text: 'A' }]);
  });

  // CHANGED with the tags-need-a-name rule. Tags are stripped from an unnamed
  // move BEFORE the blank-row check, so a row whose only content was tags
  // arrives at that check as `{name:'',text:''}` and goes with the rest of the
  // blank rows; a row carrying a MARK still stays, because `- [x] gained` is
  // representable on an unnamed move where `(tags)` is not. Deep equality
  // rather than the old length count, so the surviving row's exact shape is
  // pinned too.
  it('drops an unnamed row whose only content was tags, but keeps one carrying a mark', () => {
    const out = normalizeDiscovery({ moves: [
      { name: '', text: '', tags: 'near' },
      { name: '', text: '', gained: true },
    ] });
    expect(out?.moves).toEqual([{ name: '', text: '', gained: true }]);
  });

  // FINAL REVIEW, finding 2: the third read/write asymmetry on this branch.
  // `writeMoves` emits the `(tags)` parenthetical only inside a
  // `### Name (tags)` heading — a bare `### (tags)` reads back as a move NAMED
  // "(tags)", inventing text — so an UNNAMED move's tags left through the
  // export and never came home, while MovesEditor collected them and this
  // function stored them. Tags require a NAME, and the rule lives here, at the
  // single read boundary `writeCharacter` also normalises through, so both ends
  // agree instead of one silently losing what the other kept.
  it('drops tags from an unnamed move, which the exporter cannot represent', () => {
    const out = normalizeDiscovery({ moves: [{ name: '', text: 'It hums.', tags: '2 charges' }] });
    expect(out?.moves).toEqual([{ name: '', text: 'It hums.' }]);
  });

  // The other half, so the rule cannot be "over-applied" into dropping every
  // move's tags: the discriminator is the NAME, not the tags.
  it('keeps tags on a named move', () => {
    const out = normalizeDiscovery({ moves: [
      { name: 'Inflame', text: 'It hums.', tags: '2 charges' },
    ] });
    expect(out?.moves).toEqual([{ name: 'Inflame', text: 'It hums.', tags: '2 charges' }]);
  });

  it('stores gained only when true, because the vault cannot write false', () => {
    // The mark is emitted only when truthy, so a stored `false` came back
    // absent and the block no longer equalled itself across a round trip.
    const out = normalizeDiscovery({ moves: [
      { name: 'Ward', text: 'x', gained: false },
      { name: 'Hatred', text: 'y', gained: true },
    ] });
    expect(out?.moves?.[0]).not.toHaveProperty('gained');
    expect(out?.moves?.[1]?.gained).toBe(true);
  });

  it('keeps a move with an empty name rather than dropping typed text', () => {
    const out = normalizeDiscovery({ moves: [{ name: '', text: 'When you...' }] });
    expect(out?.moves).toEqual([{ name: '', text: 'When you...' }]);
  });

  it('drops a move whose text is not a string', () => {
    const out = normalizeDiscovery({ moves: [{ name: 'X', text: 42 }, { name: 'Y', text: 'ok' }] });
    expect(out?.moves).toEqual([{ name: 'Y', text: 'ok' }]);
  });

  it('returns a fresh mutable object', () => {
    const raw = { tier: 'minor' as const, moves: [{ name: 'A', text: 'b' }] };
    const out = normalizeDiscovery(raw)!;
    out.moves!.push({ name: 'C', text: 'd' });
    expect(raw.moves).toHaveLength(1);
    // Deep-fresh, not just a new array container: mutating a returned move
    // object must not reach back into the input's move object.
    out.moves![0].name = 'mutated';
    expect(raw.moves[0].name).toBe('A');
  });

  it('tolerates a partial block from a restored revision', () => {
    expect(normalizeDiscovery({ interesting: 'x' })).toEqual({ interesting: 'x' });
  });
});

describe('discoveryBlockOf', () => {
  it('normalises whatever the column holds', () => {
    expect(discoveryBlockOf({ discovery: { tier: 'minor' } } as never)).toEqual({ tier: 'minor' });
    expect(discoveryBlockOf({ discovery: null } as never)).toBeNull();
    expect(discoveryBlockOf({} as never)).toBeNull();
  });
});

describe('parseMoveBody', () => {
  it('splits trailing `-` lines into the option list', () => {
    expect(parseMoveBody('When you roll a 10+, pick 1:\n- Drop what they carry\n- Be deafened'))
      .toEqual({
        intro: 'When you roll a 10+, pick 1:',
        options: ['Drop what they carry', 'Be deafened'],
        outro: '',
      });
  });

  it('returns the whole body as intro when there are no options', () => {
    expect(parseMoveBody('When you hold the Scepter, it howls.'))
      .toEqual({ intro: 'When you hold the Scepter, it howls.', options: [], outro: '' });
  });

  it('accepts bullets as well as hyphens, and trims', () => {
    expect(parseMoveBody('Pick 1:\n  -  a  \n• b'))
      .toEqual({ intro: 'Pick 1:', options: ['a', 'b'], outro: '' });
  });

  // INVERTS this function's first contract ("prose after the options stays in
  // the intro"), which was wrong: the card walked intro-then-options, so the
  // Red Scepter's "On a 6-" line printed ABOVE the choices it resolves. The
  // tail is its own part now and the card renders it below the list.
  it('moves prose that follows the options into the outro', () => {
    expect(parseMoveBody('Pick 1:\n- a\nOn a 6-, the GM says what happens.'))
      .toEqual({
        intro: 'Pick 1:',
        options: ['a'],
        outro: 'On a 6-, the GM says what happens.',
      });
  });

  // The switch is the FIRST option, not the last — otherwise prose caught
  // between two options falls back into the intro and prints above the list
  // again, which is the same bug in a rarer shape. Pinned so the choice is
  // deliberate rather than incidental.
  it('sends prose interleaved between options to the outro, not back to the intro', () => {
    expect(parseMoveBody('Pick 1:\n- a\nand then, whatever you chose:\n- b'))
      .toEqual({
        intro: 'Pick 1:',
        options: ['a', 'b'],
        outro: 'and then, whatever you chose:',
      });
  });

  it('handles an empty body', () => {
    expect(parseMoveBody('')).toEqual({ intro: '', options: [], outro: '' });
  });
});
