import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GraphNodePanel } from '../GraphNodePanel';
import { LanguageProvider } from '@/i18n';
import { DISCOVERY_KIND_ICONS } from '@/components/character/discoveryKindIcons';
import { MONSTER_KIND_ICONS } from '@/components/character/monsterKindIcons';
import type { Character } from '@/types';

const discovery: Character = {
  id: 'd-1', space_id: 'space-1', name: 'The bronze plate', role: 'clue',
  type: 'DISCOVERY', notes: '', instinct: '', traits: [], tags: [],
  gm_only: false, dead: false, gm_notes: null,
  created_at: '2026-08-17T00:00:00Z', updated_at: '2026-08-17T00:00:00Z',
};

function renderPanel(character: Character) {
  return render(
    <LanguageProvider>
      <GraphNodePanel
        character={character}
        characters={[character]}
        relations={[]}
        locations={[]}
        visibleCharacterIds={new Set([character.id])}
        visibleRelationTypeIds={new Set()}
        onClose={() => {}}
        onOpenCharacter={() => {}}
      />
    </LanguageProvider>,
  );
}

afterEach(() => cleanup());

describe('GraphNodePanel — discovery stamp', () => {
  // `kindIcon = monsterKindIcon(character)` resolves through `kindOf`, a
  // shape-reader that returns whatever `kind` holds regardless of type
  // (lib/character/statblock.ts) — the `statblock.ts` root fix (isMonster
  // excluding DISCOVERY) cannot reach a call site that reads the shape-reader
  // directly. `role: 'clue'` and `kind: 'maker'` map to DIFFERENT glyphs
  // (danger-enigma.png vs danger-maker.png), so a stale `kind` (a restored
  // revision, an MCP write, a row re-typed from a monster NPC) rendering the
  // bestiary stamp instead of the discovery's own subtype fails this loudly.
  it('stamps a discovery with its own subtype, never a stale monster kind', () => {
    const { container } = renderPanel({ ...discovery, kind: 'maker' });
    const stamp = container.querySelector('.stamp-icon') as HTMLElement;
    expect(stamp).toBeTruthy();
    expect(stamp.style.maskImage).toContain(DISCOVERY_KIND_ICONS.clue);
    expect(stamp.style.maskImage).not.toContain(MONSTER_KIND_ICONS.maker);
  });
});
