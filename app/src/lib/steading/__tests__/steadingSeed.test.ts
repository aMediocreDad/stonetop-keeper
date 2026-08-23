import { describe, it, expect } from 'vitest';
import { createDefaultSteading, STONETOP_DESCRIPTION } from '@/lib/steading/steadingSeed';

describe.each(['en', 'fr'] as const)('createDefaultSteading(%s)', (lang) => {
  const s = createDefaultSteading(lang);

  it('has the playbook starting stats', () => {
    expect(s.size).toBe('village');
    expect(s.stats).toEqual({
      fortunes: 1,
      surplus: 1,
      population: 0,
      prosperity: 0,
      defenses: 0,
    });
    expect(s.debilities).toEqual({ diminished: false, lacking: false, malcontent: false });
    expect(s.treasury.silver).toEqual({ purses: 0, handfuls: 0, coins: 0 });
    expect(s.treasury.gold).toEqual({ purses: 0, handfuls: 0, coins: 0 });
  });

  it('has the default lists', () => {
    expect(s.resources).toHaveLength(8);
    expect(s.fortifications).toHaveLength(5);
    expect(s.assets).toHaveLength(4);
  });

  it('has all 17 standard improvements, none started', () => {
    expect(s.improvements).toHaveLength(17);
    for (const imp of s.improvements) {
      expect(imp.custom).toBe(false);
      expect(imp.completed).toBe(false);
      expect(imp.requirements.length).toBeGreaterThan(0);
      expect(imp.requirements.every((r) => r.done === false)).toBe(true);
      expect(imp.name.length).toBeGreaterThan(0);
      expect(imp.effects.length).toBeGreaterThan(0);
    }
    // ids stables, identiques dans les deux langues
    expect(s.improvements.map((i) => i.id)).toEqual([
      'additional-housing', 'aurochs-hunting', 'expanded-trades', 'greater-harvest',
      'harnessing-the-stream', 'herd-of-horses', 'heroic-reputation', 'inn',
      'market', 'mill', 'palisade', 'raincatching', 'standing-watch', 'stone-wall',
      'township', 'weapons-of-war', 'well-trained-militia',
    ]);
  });

  it('returns fresh objects each call (no shared mutable state)', () => {
    const a = createDefaultSteading(lang);
    const b = createDefaultSteading(lang);
    a.stats.surplus = 99;
    a.improvements[0].requirements[0].done = true;
    expect(b.stats.surplus).toBe(1);
    expect(b.improvements[0].requirements[0].done).toBe(false);
  });

  it('has a description', () => {
    expect(STONETOP_DESCRIPTION[lang].length).toBeGreaterThan(0);
  });
});
