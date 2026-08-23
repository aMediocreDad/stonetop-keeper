import { describe, expect, it } from 'vitest';
import {
  clampLoyalty, emptyStatBlock, followerOf, isFollower, isMonster, isMonsterKind,
  kindOf, kindWithDefault, normalizeFollower, normalizeStatBlock, tagsApply,
} from '../statblock';
import type { Character, StatBlock } from '../../../types';

/** L'ancienne forme : kind/follower imbriqués dans le bloc. Le type ne les
 *  déclare plus — c'est justement ce que le repli de lecture doit rattraper. */
const legacy = (extra: Record<string, unknown>) =>
  ({ ...emptyStatBlock(), ...extra }) as unknown as StatBlock;

describe('normalizeStatBlock', () => {
  it('returns null for null/undefined/non-objects', () => {
    expect(normalizeStatBlock(null)).toBeNull();
    expect(normalizeStatBlock(undefined)).toBeNull();
    expect(normalizeStatBlock('hp 6')).toBeNull();
  });

  it('returns a fresh, mutable object for a valid block', () => {
    const block = { ...emptyStatBlock(), damage: 'bronze knife d4 (hand)' };
    const out = normalizeStatBlock(block);
    expect(out).toEqual(block);
    expect(out).not.toBe(block);
  });

  it('defaults missing fields and drops garbage', () => {
    const out = normalizeStatBlock({ hp: '4', moves: ['Wander off', 7, null] });
    expect(out).toEqual({
      hp: 4, armor: 0, armorNote: '', damage: '',
      specialQualities: '', moves: ['Wander off'],
    });
  });

  it('defaults a missing hp to 6 (revision-restore of a partial block)', () => {
    expect(normalizeStatBlock({ damage: 'claws d6' })!.hp).toBe(6);
    expect(normalizeStatBlock({ hp: 'x' })!.hp).toBe(6);
  });

  // Les PV ne sont plus suivis en séance : sur une ligne d'avant, c'est la
  // RÉSERVE (`maxHp`) qui est la valeur de fiche, pas le compteur laissé à 2.
  it('legacy hp/maxHp rows keep the pool, and the maxHp key is dropped', () => {
    const out = normalizeStatBlock({ hp: 2, maxHp: 6, damage: 'bite d6' })!;
    expect(out.hp).toBe(6);
    expect(out).not.toHaveProperty('maxHp');
  });

  it('floors hp at 0', () => {
    expect(normalizeStatBlock({ hp: -4 })!.hp).toBe(0);
  });

  // Les deux clés ont leur propre colonne : les relire ici les réécrirait
  // dans le JSONB au prochain enregistrement.
  it('never carries kind/follower back into the block', () => {
    const out = normalizeStatBlock({
      hp: 6, kind: 'beast', follower: { cost: 'coin', loyalty: 1 },
    })!;
    expect(out).not.toHaveProperty('kind');
    expect(out).not.toHaveProperty('follower');
  });
});

describe('normalizeFollower', () => {
  it('returns null for non-objects', () => {
    expect(normalizeFollower(null)).toBeNull();
    expect(normalizeFollower('yes')).toBeNull();
    expect(normalizeFollower([])).toBeNull();
  });

  it('defaults fields and clamps loyalty into 0..3', () => {
    expect(normalizeFollower({ cost: 'recognition', loyalty: 9 }))
      .toEqual({ cost: 'recognition', loyalty: 3, leaderId: null });
    expect(normalizeFollower({})).toEqual({ cost: '', loyalty: 0, leaderId: null });
  });
});

describe('clamps', () => {
  it('clampLoyalty: 0..3, rounds', () => {
    expect(clampLoyalty(-1)).toBe(0);
    expect(clampLoyalty(2.6)).toBe(3);
    expect(clampLoyalty(9)).toBe(3);
  });
});

describe('kindOf', () => {
  it('rejects unknown kinds, keeps known ones', () => {
    expect(kindOf({ kind: 'beast', statblock: null })).toBe('beast');
    expect(kindOf({ kind: 'dragon' as never, statblock: null })).toBeNull();
    expect(kindOf({ statblock: null })).toBeNull();
  });

  // Restauration d'une révision antérieure à la migration, ou cache
  // localStorage écrit avant elle.
  it('falls back to the legacy nested kind', () => {
    expect(kindOf({ statblock: legacy({ kind: 'undead' }) })).toBe('undead');
    // La colonne gagne quand les deux sont là.
    expect(kindOf({ kind: 'spirit', statblock: legacy({ kind: 'undead' }) })).toBe('spirit');
  });
});

describe('kindWithDefault', () => {
  // « NPC » est la catégorie neutre du bestiaire, pas une absence.
  it('gives a PNJ the npc kind when nothing is stored', () => {
    expect(kindWithDefault({ type: 'PNJ', statblock: null })).toBe('npc');
    expect(kindWithDefault({ type: 'PNJ', kind: 'hazard', statblock: null })).toBe('hazard');
    // Le repli legacy passe avant le défaut.
    expect(kindWithDefault({ type: 'PNJ', statblock: legacy({ kind: 'undead' }) })).toBe('undead');
  });

  it('defaults nothing else — a PJ, a GROUPE and a MENACE stay empty', () => {
    expect(kindWithDefault({ type: 'PJ', statblock: null })).toBeNull();
    expect(kindWithDefault({ type: 'GROUPE', statblock: null })).toBeNull();
    expect(kindWithDefault({ type: 'MENACE', statblock: null })).toBeNull();
  });
});

describe('isMonster / tagsApply', () => {
  // `role: ''` is only here for tagsApply's benefit (isMonster never reads it) —
  // tagsApply's signature gained `role` in Task 7 so it can read a discovery's
  // kind; every other call below keeps the same shape.
  const plain = { type: 'PNJ' as const, statblock: null, role: '' };

  it('treats npc as the neutral not-a-monster category', () => {
    expect(isMonsterKind('npc')).toBe(false);
    expect(isMonsterKind(null)).toBe(false);
    expect(isMonsterKind('undead')).toBe(true);
    // Un PNJ sans rien retombe sur `npc` via kindWithDefault.
    expect(isMonster(plain)).toBe(false);
    expect(isMonster({ ...plain, kind: 'npc' })).toBe(false);
    expect(isMonster({ ...plain, kind: 'undead' })).toBe(true);
    // Le repli legacy compte aussi.
    expect(isMonster({ type: 'PNJ', statblock: legacy({ kind: 'beast' }) })).toBe(true);
  });

  // `kind` n'a aucun sens sur une DISCOVERY ("something there is to find",
  // pas un acteur) — la valeur peut rester sur la ligne, elle ne doit plus
  // se lire comme une nature de monstre.
  it('kind never reads as monsterhood on a DISCOVERY, still does on a PNJ', () => {
    expect(isMonster({ type: 'DISCOVERY', kind: 'maker', statblock: null })).toBe(false);
    expect(isMonster({ type: 'PNJ', kind: 'maker', statblock: null })).toBe(true);
  });

  // Garde-fou de régression : la nouvelle exclusion ne doit pas déteindre
  // sur un type qu'elle ne concerne pas. Ceci fige un comportement
  // PRÉEXISTANT (un `kind` périmé sur un PJ s'est toujours lu tel quel — rien
  // n'exclut le PJ ici, et ce n'est pas ce test qui l'affirme) ; seule la
  // DISCOVERY est nouvellement refusée.
  it('leaves a PJ unaffected', () => {
    expect(isMonster({ type: 'PJ', kind: 'maker', statblock: null })).toBe(true);
  });

  // Les tags sont des stats de jeu.
  it('gives tags to monsters and followers only', () => {
    expect(tagsApply(plain)).toBe(false);
    expect(tagsApply({ type: 'PJ', statblock: null, role: '' })).toBe(false);
    expect(tagsApply({ type: 'MENACE', statblock: null, role: '' })).toBe(false);
    expect(tagsApply({ type: 'GROUPE', statblock: null, role: '' })).toBe(false);

    expect(tagsApply({ ...plain, kind: 'beast' })).toBe(true);
    expect(tagsApply({ ...plain, follower: { cost: '', loyalty: 0, leaderId: null } })).toBe(true);
    // Un GROUPE statté compte : « group » est lui-même un tag d'organisation,
    // et un groupe-follower est une troupe.
    expect(tagsApply({
      type: 'GROUPE', statblock: null, role: '', follower: { cost: '', loyalty: 0, leaderId: null },
    })).toBe(true);
    // Une menace-monstre aussi.
    expect(tagsApply({ type: 'MENACE', statblock: null, role: '', kind: 'undead' })).toBe(true);
  });

  // C'est CE cas précis qui faisait fuiter un éditeur de Tags sur une fiche
  // DISCOVERY : un `kind` de monstre ET un bloc follower périmés sur la même
  // ligne (fiche re-typée, révision restaurée, écriture MCP). Aucune des deux
  // portes ne doit s'ouvrir.
  it('a DISCOVERY gets no tags through either door, even carrying both shapes', () => {
    expect(tagsApply({
      type: 'DISCOVERY', statblock: null, role: '', kind: 'undead',
      follower: { cost: '', loyalty: 0, leaderId: null },
    })).toBe(false);
  });
});

describe('followerOf / isFollower', () => {
  const block = { cost: '', loyalty: 0, leaderId: null };

  it('true only when the follower block is a real object', () => {
    expect(isFollower({ type: 'PNJ', statblock: null })).toBe(false);
    expect(isFollower({ type: 'PNJ', follower: null, statblock: emptyStatBlock() })).toBe(false);
    expect(isFollower({ type: 'PNJ', follower: block, statblock: null })).toBe(true);
  });

  it('falls back to the legacy nested follower', () => {
    const nested = legacy({ follower: { cost: 'a bed', loyalty: 2 } });
    expect(isFollower({ type: 'PNJ', statblock: nested })).toBe(true);
    expect(followerOf({ statblock: nested }))
      .toEqual({ cost: 'a bed', loyalty: 2, leaderId: null });
  });

  // Parité avec app_character_mechanics_open : c'est CE prédicat qui décide
  // qu'une menace révélée ne publie pas son instinct et son bloc de stats.
  it('a MENACE is never a follower, whatever shape the row carries', () => {
    expect(isFollower({ type: 'MENACE', follower: block, statblock: null })).toBe(false);
    expect(isFollower({
      type: 'MENACE', statblock: legacy({ follower: { cost: 'a life', loyalty: 1 } }),
    })).toBe(false);
    // followerOf reste le lecteur BRUT : il rend la forme telle quelle, et
    // c'est voulu — le bloc stocké n'est pas effacé, seulement inerte.
    expect(followerOf({ follower: block, statblock: null })).toEqual(block);
    // Un GROUPE, lui, peut être une troupe-follower.
    expect(isFollower({ type: 'GROUPE', follower: block, statblock: null })).toBe(true);
  });

  it('gives a MENACE no tags through the follower door', () => {
    expect(tagsApply({ type: 'MENACE', statblock: null, role: '', follower: block })).toBe(false);
  });

  // Une DISCOVERY n'est pas un acteur : "something there is to find", pas un
  // suiveur. Le bloc peut rester sur la ligne (fiche re-typée, révision
  // restaurée, écriture MCP) — c'est la forme qui survit, pas le sens.
  it('a DISCOVERY is never a follower, whatever shape the row carries', () => {
    expect(isFollower({ type: 'DISCOVERY', follower: block, statblock: null })).toBe(false);
    // Un PNJ, lui, reste un follower dans les mêmes conditions.
    expect(isFollower({ type: 'PNJ', follower: block, statblock: null })).toBe(true);
  });

  // Garde-fou de régression : un PJ suiveur (cas rare mais permis par la
  // forme) n'est pas affecté par l'exclusion DISCOVERY.
  it('leaves a PJ unaffected', () => {
    expect(isFollower({ type: 'PJ', follower: block, statblock: null })).toBe(true);
  });
});

describe('tagsApply on a discovery', () => {
  const disc = (role: string, extra: Partial<Character> = {}) =>
    ({ type: 'DISCOVERY', role, ...extra } as Character);

  it('is true for an artifact and an arcanum — the book writes their game elements as tags', () => {
    expect(tagsApply(disc('artifact'))).toBe(true);
    expect(tagsApply(disc('arcanum'))).toBe(true);
  });

  it('is false for every other kind — a clue has no game elements', () => {
    for (const role of ['clue', 'revelation', 'site', 'encounter', 'opportunity', '']) {
      expect(tagsApply(disc(role))).toBe(false);
    }
  });

  it('is not fooled by a leftover monster kind or follower block on a discovery', () => {
    expect(tagsApply(disc('clue', { kind: 'beast' }))).toBe(false);
    expect(tagsApply(disc('clue', { follower: { cost: '', loyalty: 0, leaderId: null } }))).toBe(false);
  });

  it('leaves the other four types exactly as they were', () => {
    expect(tagsApply({ type: 'PNJ', kind: 'beast' } as Character)).toBe(true);
    expect(tagsApply({ type: 'PNJ' } as Character)).toBe(false);
    expect(tagsApply({ type: 'PJ' } as Character)).toBe(false);
    expect(tagsApply({ type: 'MENACE' } as Character)).toBe(false);
  });
});
