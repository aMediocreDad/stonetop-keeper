import { stringify as stringifyYaml } from 'yaml';
import type { RawCampaignData } from '../types';
import type { SpaceRole } from '../../../types';
import { EXCLUSIONS } from './fields';
import {
  FOLDERS,
  JOURNAL_PATH,
  MANIFEST_PATH,
  README_PATH,
  RELATIONS_PATH,
  TONE_AND_CONTENT_PATH,
  noteName,
  slugifyName,
} from './layout';
import { emptyContext, type VaultContext } from './context';
import { writeCharacter } from './entities/character';
import { writeLocation } from './entities/location';
import { writeRelations } from './entities/relations';
import { chronicleFileName, writeChronicleYear } from './entities/chronicle';
import { writeMap } from './entities/map';
import { writeJournal } from './entities/journal';
import { writeToneAndContent } from './entities/toneAndContent';
import { baseViews } from './bases';
import { readmeText } from './readme';
import { getRelationType } from '../../constants';
import { hasSeasonText } from '../../timeline/timelineRange';
import { resolvePromotedRelations } from '../../character/promotedRelations';

export interface VaultMeta {
  formatVersion: 1;
  exportedAt: string;
  appVersion: string;
  /** Id and name only. The invite code is a JOIN CREDENTIAL — on a space with
   *  `public_read`, the code alone grants viewer access — and a vault is made to
   *  be handed around (the README says so). Identity is what an importer needs;
   *  the credential is not, so it never rides along. */
  space: { id: string; name: string };
  /** The role the export was taken at — what it could SEE. Advisory only: it is
   *  never a gate, because import is upsert-only. */
  role: SpaceRole;
}

export interface VaultFile {
  path: string;
  content: string | Uint8Array;
}

/** Map images, handed in beside the rows because `RawCampaignData` carries no
 *  bytes — the browser fetches them separately. */
export type MapImages = Map<string, { bytes: Uint8Array; ext: string }>;

/**
 * Note names are unique across the WHOLE vault, not per folder: Obsidian
 * resolves `[[Name]]` vault-wide, so a character and a location sharing a name
 * would make every link to either one ambiguous.
 *
 * Maps share that one pool — a map called "Stonetop" beside the steading called
 * "Stonetop" makes every `[[Stonetop]]` in the vault ambiguous — but stay out of
 * `nameById`, which is the LINK TARGET index: a pin's `[[…]]` must resolve to a
 * sheet, never to the map it is drawn on.
 */
export function buildContext(raw: RawCampaignData): VaultContext {
  const ctx = emptyContext();
  const taken = new Set<string>();
  for (const c of raw.characters) {
    const name = noteName(c.name, c.id, taken);
    taken.add(name);
    ctx.nameById.set(c.id, name);
    ctx.idByName.set(name, c.id);
    ctx.characterIds?.add(c.id);
  }
  for (const l of raw.locations) {
    const name = noteName(l.name, l.id, taken);
    taken.add(name);
    ctx.nameById.set(l.id, name);
    ctx.idByName.set(name, l.id);
    ctx.locationIds?.add(l.id);
  }
  for (const m of raw.maps ?? []) {
    const name = noteName(m.name, m.id, taken);
    taken.add(name);
    ctx.mapNames?.set(m.id, name);
  }
  return ctx;
}

/** The generated relations block appended to a character note. Reading ignores
 *  it — `Relations.md` is the authority.
 *
 *  Promoted relations get their own sub-block, mirroring the sheet's
 *  segmentation: a lead is a different KIND of edge from a friendship, and a
 *  flat list of thirteen types buries that. The validity rule is the
 *  resolver's, not a local reimplementation — a `leads-to` whose `from` end is
 *  not a discovery is inert and stays in the ordinary list, and so is one
 *  stored on a kind that promotes something else (an artifact promotes
 *  `held-by`).
 *
 *  The heading stays `### Leads` even though the block now also carries
 *  possessions and encounters: `KNOWN_TITLES` in `entities/character.ts` must
 *  keep recognising it to read vaults written before this, and renaming it
 *  would strand them. */
function relationsSection(characterId: string, raw: RawCampaignData, ctx: VaultContext): string {
  const mine = raw.relations.filter(
    (r) => r.from_character_id === characterId || r.to_character_id === characterId,
  );
  if (!mine.length) return '';
  const { promotedRelationIds } = resolvePromotedRelations(raw.characters, raw.relations);
  const name = (id: string) => {
    const n = ctx.nameById.get(id);
    return n ? `[[${n}]]` : id;
  };
  // Subject-first, exactly as the edge is stored — the same form the MCP's
  // prose renderer uses. An arrow-and-label shorthand (`← Enemy: [[Ana]]`)
  // reads as a claim about the wrong end, and for a directional type like
  // `membre` or `leads-to` it states the reverse of what the row says.
  const line = (r: (typeof mine)[number]) => {
    const label = getRelationType(r.relation_type).label.toLowerCase();
    const detail = r.relation_detail ? ` — ${r.relation_detail}` : '';
    return `- ${name(r.from_character_id)} — ${label} — ${name(r.to_character_id)}${detail}`;
  };
  const leads = mine.filter((r) => promotedRelationIds.has(r.id));
  const bonds = mine.filter((r) => !promotedRelationIds.has(r.id));
  const blocks: string[] = [];
  if (leads.length) blocks.push('### Leads', '', ...leads.map(line), '');
  if (bonds.length) blocks.push('### Bonds', '', ...bonds.map(line), '');
  return [
    '## Relations',
    '',
    '*Generated from `Relations.md` — edit there, not here.*',
    '',
    ...blocks,
  ].join('\n');
}

export function writeVault(
  raw: RawCampaignData,
  meta: VaultMeta,
  images: MapImages = new Map(),
): VaultFile[] {
  const ctx = buildContext(raw);
  const files: VaultFile[] = [];

  for (const c of raw.characters) {
    const name = ctx.nameById.get(c.id) ?? slugifyName(c.name);
    const note = writeCharacter(c, ctx);
    const rel = relationsSection(c.id, raw, ctx);
    const folder = c.type === 'DISCOVERY' ? FOLDERS.discoveries : FOLDERS.characters;
    files.push({
      path: `${folder}/${name}.md`,
      content: rel ? `${note}\n${rel}` : note,
    });
  }

  for (const l of raw.locations) {
    const name = ctx.nameById.get(l.id) ?? slugifyName(l.name);
    files.push({ path: `${FOLDERS.locations}/${name}.md`, content: writeLocation(l, ctx) });
  }

  files.push({ path: RELATIONS_PATH, content: writeRelations(raw.relations, ctx) });

  const strands = [
    { strand: 'player' as const, entries: raw.timeline?.entries },
    { strand: 'gm' as const, entries: raw.timeline?.gm_entries },
  ];
  for (const { strand, entries } of strands) {
    for (const [yearKey, entry] of Object.entries(entries ?? {})) {
      const year = Number(yearKey);
      if (Number.isNaN(year) || !entry) continue;
      const md = writeChronicleYear(year, strand, entry, ctx);
      // A year whose seasons are all empty produces a note with nothing under
      // the frontmatter; skip it rather than litter the vault.
      if (!md.includes('## ')) continue;
      files.push({ path: `${FOLDERS.chronicle}/${chronicleFileName(year, strand)}.md`, content: md });
    }
  }

  for (const m of raw.maps ?? []) {
    const name = ctx.mapNames?.get(m.id) ?? slugifyName(m.name);
    const img = images.get(m.id);
    // The image is named after the NOTE, so it inherits that name's vault-wide
    // uniqueness. Slugifying the map's name again would give two maps called
    // "The Marsh" one picture between them: the second ZIP entry overwrites the
    // first, and both notes point at whichever survived.
    const imageFile = img ? `${name}.${img.ext}` : '';
    if (img) {
      files.push({ path: `${FOLDERS.mapImages}/${imageFile}`, content: img.bytes });
    }
    const pins = (raw.mapPins ?? []).filter((p) => p.map_id === m.id);
    files.push({ path: `${FOLDERS.maps}/${name}.md`, content: writeMap(m, pins, imageFile, ctx) });
  }

  if (raw.gmJournal) {
    files.push({ path: JOURNAL_PATH, content: writeJournal(raw.gmJournal, ctx) });
  }

  if (raw.toneAndContent) {
    files.push({
      path: TONE_AND_CONTENT_PATH,
      content: writeToneAndContent(raw.toneAndContent, ctx),
    });
  }

  files.push({ path: MANIFEST_PATH, content: manifest(raw, meta) });
  files.push({ path: README_PATH, content: readmeText(meta) });
  for (const v of baseViews()) files.push(v);

  return files;
}

function manifest(raw: RawCampaignData, meta: VaultMeta): string {
  const seasons = countSeasons(raw);
  return stringifyYaml(
    {
      format: 'ink-and-stone-vault',
      formatVersion: meta.formatVersion,
      exportedAt: meta.exportedAt,
      app: { name: 'Ink & Stone', version: meta.appVersion },
      space: meta.space,
      role: meta.role,
      timeline: {
        current_year: raw.timeline?.current_year ?? null,
        current_season: raw.timeline?.current_season ?? null,
      },
      counts: {
        characters: raw.characters.length,
        locations: raw.locations.length,
        relations: raw.relations.length,
        maps: (raw.maps ?? []).length,
        pins: (raw.mapPins ?? []).length,
        seasons,
      },
      excluded: [...EXCLUSIONS],
    },
    { lineWidth: 0 },
  );
}

/**
 * Counts seasons by the app's OWN emptiness rule (`hasSeasonText`), not by
 * "the body string is truthy". A season holding `<p></p>` is non-empty as a
 * string and empty as text: counting it made the manifest claim 24 seasons for
 * a vault that contained 22, because the writer skips the empty ones.
 */
function countSeasons(raw: RawCampaignData): number {
  let n = 0;
  for (const entries of [raw.timeline?.entries, raw.timeline?.gm_entries]) {
    for (const entry of Object.values(entries ?? {})) {
      for (const stored of Object.values(entry ?? {})) {
        if (hasSeasonText(stored)) n += 1;
      }
    }
  }
  return n;
}
