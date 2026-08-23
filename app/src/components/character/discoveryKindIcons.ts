import type { DiscoveryKind } from '@/lib/character/discoveryKinds';
// The pack has no six-glyph discovery set, so each kind borrows the glyph that
// actually means the thing. Pointing at existing files rather than duplicating
// them is the convention monsterKindIcons.ts already set for npc/faction.
import clue from '@/assets/stonetop/danger-enigma.png';          // a question mark: "a signifier of something else"
import revelation from '@/assets/stonetop/danger-tulpa.png'; // a spiral of thought: the thing learned
import site from '@/assets/stonetop/danger-thingbelow.png';      // a cave mouth: the tomb, the ruin, the delve
import encounter from '@/assets/stonetop/entity-character.png';  // a figure met on the road
import opportunity from '@/assets/stonetop/steading-fortunes.png'; // a rising sun: an opening
import artifact from '@/assets/stonetop/danger-maker.png';       // the Maker glyph — the book's artifacts are Maker-work
import arcanum from '@/assets/stonetop/danger-emanation.png';    // radiating waves: mysteries still locked
import unfiled from '@/assets/stonetop/chapter-circle.png';      // a plain seal, no claim about the kind

/**
 * Subtype stamps (Jason Lutes, CC BY 4.0 — see NOTICE.md). Rendered through
 * StampIcon as mask-image + currentColor, so they tint like any glyph.
 *
 * Separate from lib/character/discoveryKinds.ts so that module stays pure:
 * it is reachable from lib/shared.ts, which the MCP Worker builds, and Vite
 * PNG imports do not survive that trip.
 */
export const DISCOVERY_KIND_ICONS: Record<DiscoveryKind, string> = {
  clue, revelation, site, encounter, opportunity, artifact, arcanum,
};

/**
 * The stamp for a discovery with no kind chosen. `chapter-circle` and not the
 * entity bust: the bust is `encounter`'s, and a card must not show the same
 * glyph for "unfiled" and for a specific kind.
 *
 * It is also the seal CharacterCard presses for a character who has left play
 * — which is why Task 5 suppresses that seal on a DISCOVERY. A discovery has
 * no `dead` state (the checkbox is not offered), so nothing is lost, and the
 * two marks can never collide on one card.
 */
export const DISCOVERY_UNFILED_ICON: string = unfiled;
