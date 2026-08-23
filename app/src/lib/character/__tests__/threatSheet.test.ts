import { describe, it, expect } from 'vitest';
import { emptyThreatSheet, normalizeThreatSheet } from '@/lib/character/threatSheet';
import type { ThreatSheet } from '@/types';

describe('normalizeThreatSheet', () => {
  it('returns an empty sheet for null/garbage', () => {
    expect(normalizeThreatSheet(null)).toEqual(emptyThreatSheet());
    expect(normalizeThreatSheet('nope')).toEqual(emptyThreatSheet());
  });

  it('passes a new-shape sheet through unchanged (idempotent)', () => {
    const sheet: ThreatSheet = {
      instinct: 'to consume',
      portents: [{ text: 'wells dry', done: true }],
      impendingDoom: { text: '<p>The barrow opens</p>', done: false },
      stakes: [{ text: 'Who dies first?', done: true }],
      gmMoves: ['whisper'],
      type: null,
    };
    expect(normalizeThreatSheet(sheet)).toEqual(sheet);
    expect(normalizeThreatSheet(sheet)).not.toBe(sheet); // objet frais, mutable
  });

  it('splits legacy string stakes on block boundaries into checklist items', () => {
    const out = normalizeThreatSheet({
      ...emptyThreatSheet(),
      stakes: '<p>Who dies first?</p><p>Does Caradoc <strong>break</strong>?</p>',
    });
    expect(out.stakes).toEqual([
      { text: 'Who dies first?', done: false },
      { text: 'Does Caradoc break?', done: false },
    ]);
  });

  it('turns legacy list-item stakes into items without the dash prefix', () => {
    const out = normalizeThreatSheet({
      ...emptyThreatSheet(),
      stakes: '<ul><li>One?</li><li>Two?</li></ul>',
    });
    expect(out.stakes).toEqual([
      { text: 'One?', done: false },
      { text: 'Two?', done: false },
    ]);
  });

  it('wraps legacy plain-text doom as a paragraph, keeps done', () => {
    const out = normalizeThreatSheet({
      ...emptyThreatSheet(),
      impendingDoom: { text: 'Total eclipse', done: true },
    });
    expect(out.impendingDoom).toEqual({ text: '<p>Total eclipse</p>', done: true });
  });

  it('leaves rich doom HTML alone', () => {
    const doom = { text: '<p>Total <em>eclipse</em></p>', done: false };
    expect(
      normalizeThreatSheet({ ...emptyThreatSheet(), impendingDoom: doom }).impendingDoom,
    ).toEqual(doom);
  });

  it('fills missing fields with defaults and drops malformed items', () => {
    const out = normalizeThreatSheet({ portents: [{ text: 'ok', done: false }, 'junk', null] });
    expect(out.portents).toEqual([{ text: 'ok', done: false }]);
    expect(out.impendingDoom).toEqual({ text: '', done: false });
    expect(out.stakes).toEqual([]);
    expect(out.gmMoves).toEqual([]);
  });

  it('carries a valid threat type through and nulls invalid ones', () => {
    expect(normalizeThreatSheet({ ...emptyThreatSheet(), type: 'wildcard' }).type).toBe('wildcard');
    expect(normalizeThreatSheet({ ...emptyThreatSheet(), type: 'kaiju' }).type).toBeNull();
    expect(normalizeThreatSheet(emptyThreatSheet()).type).toBeNull();
  });
});
