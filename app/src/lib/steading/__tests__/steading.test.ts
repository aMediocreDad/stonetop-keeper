import { describe, it, expect } from 'vitest';
import {
  clampTrack,
  clampCount,
  improvementProgress,
  requirementCount,
  requirementTicks,
  findSteadingLocation,
} from '@/lib/steading/steading';
import type { Location, SteadingImprovement } from '@/types';

const imp = (reqs: boolean[]): SteadingImprovement => ({
  id: 'x',
  name: 'X',
  summary: '',
  requirements: reqs.map((done, i) => ({ text: `r${i}`, done })),
  effects: '',
  completed: false,
  custom: false,
});

const loc = (id: string, created_at: string, steading: boolean): Location => ({
  id,
  space_id: 's1',
  name: id,
  color: '#000000',
  gm_only: false,
  created_at,
  steading: steading
    ? {
        size: 'village',
        stats: { fortunes: 1, surplus: 1, population: 0, prosperity: 0, defenses: 0 },
        debilities: { diminished: false, lacking: false, malcontent: false },
        resources: [],
        fortifications: [],
        assets: [],
        treasury: {
          silver: { purses: 0, handfuls: 0, coins: 0 },
          gold: { purses: 0, handfuls: 0, coins: 0 },
        },
        improvements: [],
      }
    : null,
});

describe('clampTrack', () => {
  it('clamps to [-1, +3]', () => {
    expect(clampTrack(-2)).toBe(-1);
    expect(clampTrack(-1)).toBe(-1);
    expect(clampTrack(0)).toBe(0);
    expect(clampTrack(3)).toBe(3);
    expect(clampTrack(5)).toBe(3);
  });
});

describe('clampCount', () => {
  it('floors at 0', () => {
    expect(clampCount(-1)).toBe(0);
    expect(clampCount(0)).toBe(0);
    expect(clampCount(7)).toBe(7);
  });
});

describe('clamp non-finite inputs', () => {
  it('never returns NaN', () => {
    expect(clampTrack(NaN)).toBe(0);
    expect(clampTrack(Infinity)).toBe(3);
    expect(clampTrack(-Infinity)).toBe(-1);
    expect(clampCount(NaN)).toBe(0);
    expect(clampCount(-Infinity)).toBe(0);
  });
});

describe('improvementProgress', () => {
  it('counts done requirements', () => {
    expect(improvementProgress(imp([true, false, true]))).toEqual({ done: 2, total: 3 });
    expect(improvementProgress(imp([]))).toEqual({ done: 0, total: 0 });
  });

  it('counts each tick of repeatable requirements', () => {
    const multi: SteadingImprovement = {
      ...imp([true]),
      requirements: [
        { text: 'An engineer', done: true },
        { text: 'Pull Together ×5 — each requires 1 season', done: false, progress: 2 },
      ],
    };
    expect(improvementProgress(multi)).toEqual({ done: 3, total: 6 });
  });
});

describe('requirementCount', () => {
  it('parses the multiplier from the text', () => {
    expect(requirementCount({ text: 'Pull Together ×5 — each requires 1 season', done: false })).toBe(5);
    expect(requirementCount({ text: 'Se serrer les coudes ×3 — chaque fois', done: false })).toBe(3);
    expect(requirementCount({ text: 'Rebuild the wall x2', done: false })).toBe(2);
    expect(requirementCount({ text: 'An exceptional engineer', done: false })).toBe(1);
    // « Value 2 » / « Valeur 2 » ne doit pas être pris pour un multiplicateur.
    expect(requirementCount({ text: 'timber & supplies (Value 2)', done: false })).toBe(1);
  });
});

describe('requirementTicks', () => {
  it('clamps progress and honours the legacy done flag', () => {
    const text = 'Pull Together ×4';
    expect(requirementTicks({ text, done: false })).toBe(0);
    expect(requirementTicks({ text, done: false, progress: 2 })).toBe(2);
    expect(requirementTicks({ text, done: false, progress: 9 })).toBe(4);
    expect(requirementTicks({ text, done: true })).toBe(4);
  });
});

describe('findSteadingLocation', () => {
  it('returns the oldest location with a steading', () => {
    const list = [
      loc('plain', '2026-01-01T00:00:00Z', false),
      loc('newer', '2026-03-01T00:00:00Z', true),
      loc('older', '2026-02-01T00:00:00Z', true),
    ];
    expect(findSteadingLocation(list)?.id).toBe('older');
  });

  it('returns undefined when no steading exists', () => {
    expect(findSteadingLocation([loc('plain', '2026-01-01T00:00:00Z', false)])).toBeUndefined();
    expect(findSteadingLocation([])).toBeUndefined();
  });
});
