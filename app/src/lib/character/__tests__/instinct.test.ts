import { describe, it, expect } from 'vitest';
import { instinctOf } from '../instinct';

describe('instinctOf', () => {
  it('prefers the column when non-blank', () => {
    expect(instinctOf({ instinct: 'complain', threat: null })).toBe('complain');
  });
  it('falls back to legacy threat.instinct when the column is blank', () => {
    const threat = { instinct: 'hollow out the hill', portents: [], stakes: [],
      gmMoves: [], impendingDoom: { text: '', done: false } };
    expect(instinctOf({ instinct: '', threat })).toBe('hollow out the hill');
    expect(instinctOf({ instinct: '   ', threat })).toBe('hollow out the hill');
  });
  it('returns empty string when neither exists', () => {
    expect(instinctOf({ instinct: '', threat: null })).toBe('');
    expect(instinctOf({ instinct: '' })).toBe('');
  });
});
