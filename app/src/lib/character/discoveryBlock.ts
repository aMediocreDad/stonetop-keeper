// Relative imports on purpose: this module is reachable from lib/shared.ts,
// which the MCP Worker builds, and its vitest cannot resolve the `@` alias
// (cf. lib/character/statblock.ts).
import type { ArcMove, ArcTrack, Character, DiscoveryBlock, Trait } from '../../types';

export const DISCOVERY_TIERS = ['minor', 'major'] as const;
const TIERS = new Set<string>(DISCOVERY_TIERS);

function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function normalizeMove(raw: unknown): ArcMove | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  // The TEXT is what makes a move; a missing/garbage body means there is
  // nothing to render. An empty NAME is kept: the front of the Red Scepter
  // carries unnamed trigger lines, and dropping the entry would lose text
  // someone typed (which this repo never does to hide a field).
  const text = str(m.text);
  if (text === undefined) return null;
  const out: ArcMove = { name: str(m.name) ?? '', text };
  // TAGS REQUIRE A NAME. In the book a tags line always sits under a move's
  // name ("BURNING HATRED (near, magical, reload)"); the
  // unnamed entries are flavour triggers and carry none. The two ends could
  // not agree on that shape: `writeMoves` emits the `(tags)` parenthetical
  // only inside a `### Name (tags)` heading, because a bare `### (tags)` reads
  // back as a move NAMED "(tags)" — inventing text out of a tag list. So the
  // shape dies HERE, at the single read boundary the writer also normalises
  // through (`writeCharacter`, vault/entities/character.ts), rather than being
  // silently dropped by one end of a round trip. `MovesEditor` disables its
  // tags input while the name is empty, so it cannot be typed in either.
  const tags = str(m.tags);
  if (tags !== undefined && out.name !== '') out.tags = tags;
  // Only `true` is stored. `gained: false` and an absent key mean the same
  // thing to every reader, but the vault has no way to WRITE false — the mark
  // is emitted only when truthy — so keeping the key broke the round trip:
  // parse(write(x)) dropped it and the block came back unequal to itself.
  if (m.gained === true) out.gained = true;
  // A move with no name, no body, no tags and no mark is not a move: it is the
  // blank row `MovesEditor` appends the moment you click "Add a move". Dropped
  // HERE, at the single read boundary, rather than in the exporter — because
  // the exporter's heading for such a row (`### ` with an empty title, then
  // trimmed) collapses to a bare `###`, which the section regex does not match,
  // so the entry vanished on re-import AND welded a stray `###` onto the
  // previous move's body. Killing the shape is better than teaching two
  // separate layers to survive it.
  //
  // ORDER MATTERS with the tags rule above, which runs FIRST: an unnamed row
  // whose only content was tags arrives here as `{name:'',text:''}` and goes
  // with the rest of the blank rows. Checking blankness first and stripping
  // tags after would persist exactly the empty shell this guard exists to
  // kill.
  if (out.name === '' && out.text === '' && out.tags === undefined && out.gained !== true) {
    return null;
  }
  return out;
}

function normalizeTrack(raw: unknown): ArcTrack | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const max = Math.max(0, toInt(t.max, 0));
  return {
    label: str(t.label) ?? '',
    max,
    // Clamped on READ, not only on write: a restored revision can carry a
    // `marked` from before the max was lowered.
    marked: Math.max(0, Math.min(max, toInt(t.marked, 0))),
  };
}

function normalizeTrait(raw: unknown): Trait | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const label = str(t.label);
  if (label === undefined) return null;
  return { label, checked: t.checked === true };
}

function list<T>(raw: unknown, one: (v: unknown) => T | null): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(one).filter((v): v is T => v !== null);
}

/**
 * The single read boundary for the block, and PERMANENT for the same reason
 * normalizeStatBlock and normalizeThreatSheet are: restoring a revision or a
 * hand-written MCP payload can resurrect a partial or foreign shape at any
 * time. Always returns a fresh, mutable object.
 *
 * Unknown keys are DROPPED, so they disappear from storage at the next save.
 * An unrecognised `tier` is dropped rather than defaulted — "no tier" is a
 * real state (an artifact has none), so guessing `minor` would be a lie.
 */
export function normalizeDiscovery(raw: unknown): DiscoveryBlock | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  const out: DiscoveryBlock = {};
  const tier = str(b.tier);
  if (tier !== undefined && TIERS.has(tier)) out.tier = tier as DiscoveryBlock['tier'];
  const interesting = str(b.interesting);
  if (interesting !== undefined) out.interesting = interesting;
  const useful = str(b.useful);
  if (useful !== undefined) out.useful = useful;
  const moves = list(b.moves, normalizeMove);
  if (moves) out.moves = moves;
  const tracks = list(b.tracks, normalizeTrack);
  if (tracks) out.tracks = tracks;
  const mysteries = list(b.mysteries, normalizeMove);
  if (mysteries) out.mysteries = mysteries;
  const consequences = list(b.consequences, normalizeTrait);
  if (consequences) out.consequences = consequences;
  return out;
}

export function discoveryBlockOf(c: Pick<Character, 'discovery'>): DiscoveryBlock | null {
  return normalizeDiscovery(c.discovery);
}

const OPTION_LINE = /^\s*[-•]\s+(.*)$/;

/**
 * A move body's three parts. The only structure the book's move bodies have is
 * an option list ("everyone nearby must choose 1 from the list below"), so one
 * rule covers every example in the chapter: a line beginning `-` or `•` is an
 * option, everything else is prose.
 *
 * The prose splits AROUND the list, because that is where the book prints it:
 * "On a 7-9, choose 1:" announces the options and "On a 6-, the GM says what
 * the scepter wants instead" resolves what follows them (the Red Scepter).
 * Keeping the tail in the intro — this function's first
 * contract — printed the 6- line ABOVE the choices it answers, which is wrong
 * game text; `outro` exists to render it below the list.
 *
 * The switch is on the FIRST option, not the last: prose interleaved between
 * two options goes to the outro rather than being stranded back above the
 * list, which would be the same bug in a rarer shape. Nothing is ever dropped.
 */
export function parseMoveBody(text: string): { intro: string; options: string[]; outro: string } {
  const intro: string[] = [];
  const options: string[] = [];
  const outro: string[] = [];
  for (const line of text.split('\n')) {
    const m = OPTION_LINE.exec(line);
    if (m) options.push(m[1].trim());
    else if (line.trim() !== '') (options.length > 0 ? outro : intro).push(line.trim());
  }
  return { intro: intro.join('\n'), options, outro: outro.join('\n') };
}
