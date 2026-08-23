import { parse as parseYaml } from 'yaml';
import type { RawCampaignData } from '../types';
import type { CampaignMap, MapPin, Timeline, TimelineEntry } from '../../../types';
import { FOLDERS, JOURNAL_PATH, MANIFEST_PATH, RELATIONS_PATH, TONE_AND_CONTENT_PATH } from './layout';
import { parseFrontmatter } from './frontmatter';
import { emptyContext, type VaultContext } from './context';
import { parseCharacter } from './entities/character';
import { parseLocation } from './entities/location';
import { parseRelations } from './entities/relations';
import { parseChronicleYear } from './entities/chronicle';
import { parseMap } from './entities/map';
import { parseJournal } from './entities/journal';
import { parseToneAndContent } from './entities/toneAndContent';
import type { VaultFile, VaultMeta } from './write';

/**
 * Read a vault back into rows. **Parse only** — nothing here touches the
 * database; applying an import is a separate, GM-gated step.
 *
 * Lenient throughout, because this reads files a human has been editing in
 * Obsidian: unknown files are ignored, a missing manifest is not fatal, and one
 * malformed note is skipped rather than failing the whole vault.
 */

export interface ReadVaultResult {
  raw: RawCampaignData;
  meta: VaultMeta | null;
  /** Paths that could not be parsed, for the import screen to report. */
  skipped: string[];
}

function textOf(f: VaultFile): string {
  return typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
}

const inFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);
const isNote = (path: string) => path.toLowerCase().endsWith('.md');

/**
 * Names must resolve before any note is fully parsed — a relation row names
 * `[[Ana]]`, and Ana's id lives in her own note's frontmatter. So the context is
 * built from a cheap frontmatter-only pass first.
 */
function contextFrom(files: VaultFile[]): VaultContext {
  const ctx = emptyContext();
  for (const f of files) {
    // Discoveries are `characters` rows in their own folder — they MUST be
    // indexed here, not only parsed below: this pass is what makes
    // `[[The bronze plate]]` in a relation row or a note resolve to an id.
    const isChar =
      inFolder(f.path, FOLDERS.characters) || inFolder(f.path, FOLDERS.discoveries);
    const isLoc = inFolder(f.path, FOLDERS.locations);
    if ((!isChar && !isLoc) || !isNote(f.path)) continue;
    const name = f.path.slice(f.path.lastIndexOf('/') + 1, -3);
    const { data } = parseFrontmatter(textOf(f));
    const id = String(data.id ?? '');
    if (!id) continue;
    ctx.nameById.set(id, name);
    ctx.idByName.set(name, id);
    (isChar ? ctx.characterIds : ctx.locationIds)?.add(id);
  }
  return ctx;
}

export function readVault(files: VaultFile[]): ReadVaultResult {
  const ctx = contextFrom(files);
  const skipped: string[] = [];

  const raw: RawCampaignData = {
    characters: [],
    locations: [],
    relations: [],
    timeline: null,
    maps: [],
    mapPins: [],
    gmJournal: null,
    toneAndContent: null,
  };

  const playerYears: Record<string, TimelineEntry> = {};
  const gmYears: Record<string, TimelineEntry> = {};
  let meta: VaultMeta | null = null;
  // The current-season marker is space-level, so it rides in the manifest rather
  // than in any year's note — but it is campaign state, not bookkeeping, so it
  // must come back onto the timeline. Held aside because the manifest may be
  // read after the chronicle files.
  let currentYear: number | null = null;
  let currentSeason: Timeline['current_season'] = null;
  const maps: CampaignMap[] = [];
  const pins: MapPin[] = [];

  for (const f of files) {
    const path = f.path;
    try {
      if (path === MANIFEST_PATH) {
        const parsed = parseYaml(textOf(f)) as Record<string, unknown> | null;
        if (parsed && typeof parsed === 'object') {
          meta = {
            formatVersion: 1,
            exportedAt: String(parsed.exportedAt ?? ''),
            appVersion: String(
              (parsed.app as Record<string, unknown> | undefined)?.version ?? '',
            ),
            space: (parsed.space ?? { id: '', name: '' }) as VaultMeta['space'],
            role: (parsed.role ?? 'gm') as VaultMeta['role'],
          };
          const t = parsed.timeline as Record<string, unknown> | undefined;
          currentYear = t?.current_year == null ? null : Number(t.current_year);
          currentSeason = (t?.current_season ?? null) as Timeline['current_season'];
        }
        continue;
      }
      if (path === RELATIONS_PATH) {
        raw.relations.push(...parseRelations(textOf(f), ctx));
        continue;
      }
      if (path === JOURNAL_PATH) {
        raw.gmJournal = parseJournal(textOf(f));
        continue;
      }
      if (path === TONE_AND_CONTENT_PATH) {
        raw.toneAndContent = parseToneAndContent(textOf(f));
        continue;
      }
      if (!isNote(path)) continue;

      if (inFolder(path, FOLDERS.characters) || inFolder(path, FOLDERS.discoveries)) {
        raw.characters.push(parseCharacter(textOf(f), ctx));
      } else if (inFolder(path, FOLDERS.locations)) {
        raw.locations.push(parseLocation(textOf(f)));
      } else if (inFolder(path, FOLDERS.chronicle)) {
        const { year, strand, entry } = parseChronicleYear(textOf(f));
        (strand === 'gm' ? gmYears : playerYears)[String(year)] = entry;
      } else if (inFolder(path, FOLDERS.maps)) {
        const parsed = parseMap(textOf(f), ctx);
        maps.push(parsed.map);
        pins.push(...parsed.pins);
      }
    } catch {
      skipped.push(path);
    }
  }

  raw.maps = maps;
  raw.mapPins = pins;

  const hasChronicle =
    Object.keys(playerYears).length || Object.keys(gmYears).length || currentYear != null;
  if (hasChronicle) {
    const timeline: Timeline = {
      id: '',
      space_id: '',
      entries: playerYears,
      gm_entries: Object.keys(gmYears).length ? gmYears : null,
      current_year: currentYear,
      current_season: currentSeason,
      updated_at: '',
    };
    raw.timeline = timeline;
  }

  return { raw, meta, skipped };
}
