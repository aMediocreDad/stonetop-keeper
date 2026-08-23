import { describe, expect, it } from 'vitest';
import { MONSTER_KIND_ICONS, monsterKindIcon } from '../monsterKindIcons';
import entityCharacterStamp from '@/assets/stonetop/entity-character.png';
import entityGroupStamp from '@/assets/stonetop/entity-group.png';

describe('monsterKindIcon', () => {
  it('follows the stored kind, whatever the entity type', () => {
    expect(monsterKindIcon({ type: 'PNJ', kind: 'undead', statblock: null }))
      .toBe(MONSTER_KIND_ICONS.undead);
    // Un GROUPE marqué monstre AUSSI : une horde de crinwin est une bête, et
    // « group » n'est qu'un tag d'organisation par dessus.
    // Sans ça, le sélecteur de catégorie offert à un GROUPE ne changerait rien
    // à l'écran — un contrôle qui mentirait.
    expect(monsterKindIcon({ type: 'GROUPE', kind: 'beast', statblock: null }))
      .toBe(MONSTER_KIND_ICONS.beast);
  });

  it('returns null with no kind, leaving the per-type entity stamp in place', () => {
    expect(monsterKindIcon({ type: 'PNJ', statblock: null })).toBeNull();
    expect(monsterKindIcon({ type: 'GROUPE', statblock: null })).toBeNull();
  });

  // C'est CE fait qui justifie le défaut `npc` et la disparition de l'option
  // vide : « aucun type » et « NPC » dessinaient déjà le même tampon.
  it('draws npc and faction with the very entity stamps they fall back to', () => {
    expect(MONSTER_KIND_ICONS.npc).toBe(entityCharacterStamp);
    expect(MONSTER_KIND_ICONS.faction).toBe(entityGroupStamp);
  });

  it('reads the legacy nested kind too', () => {
    expect(monsterKindIcon({
      type: 'PNJ', statblock: { kind: 'spirit' } as never,
    })).toBe(MONSTER_KIND_ICONS.spirit);
  });
});
