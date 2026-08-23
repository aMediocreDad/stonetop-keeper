import { describe, expect, it } from 'vitest';
import { DISCOVERY_NODE_COLOR, MENACE_NODE_COLOR, nodeSize } from '../graphPalette';

describe('graph palette', () => {
  it('gives discoveries their own fill, distinct from threats', () => {
    expect(DISCOVERY_NODE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DISCOVERY_NODE_COLOR).not.toBe(MENACE_NODE_COLOR);
  });

  it('sizes a discovery like an NPC — PCs and groups stay the exceptions', () => {
    expect(nodeSize(0, 'PJ')).toBe(9);
    expect(nodeSize(0, 'GROUPE')).toBe(7);
    expect(nodeSize(0, 'DISCOVERY')).toBe(6);
    expect(nodeSize(0, 'PNJ')).toBe(6);
  });
});
