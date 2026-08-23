import { describe, expect, it } from 'vitest';
import { groupDiscRadius, pointInCircle } from '../groupBubble';

describe('groupDiscRadius', () => {
  it('has a comfortable floor for tiny groups', () => {
    expect(groupDiscRadius(1)).toBeGreaterThanOrEqual(36);
  });

  it('grows monotonically with member count', () => {
    expect(groupDiscRadius(4)).toBeGreaterThan(groupDiscRadius(1));
    expect(groupDiscRadius(16)).toBeGreaterThan(groupDiscRadius(4));
  });

  it('scales area roughly linearly with members (r ∝ √n)', () => {
    // Le terme √n quadruple membres → double rayon (hors plancher).
    const r4 = groupDiscRadius(4) - 28;
    const r16 = groupDiscRadius(16) - 28;
    expect(r16 / r4).toBeCloseTo(2);
  });
});

describe('pointInCircle', () => {
  const c = { cx: 0, cy: 0, r: 5 };

  it('accepts inside and on the border', () => {
    expect(pointInCircle({ x: 1, y: 1 }, c)).toBe(true);
    expect(pointInCircle({ x: 3, y: 4 }, c)).toBe(true);
  });

  it('rejects outside', () => {
    expect(pointInCircle({ x: 3, y: 4.01 }, c)).toBe(false);
  });
});
