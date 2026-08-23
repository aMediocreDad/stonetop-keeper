import type { Character, Season, TimelineEntry } from '../../types';
import { getRelationType } from '../constants';
import { resolveGroupMembers } from '../character/groupMembers';
import { PLAYBOOKS, parseRole } from '../character/playbooks';
import { normalizeSeason } from '../timeline/seasonEntry';
import { htmlToMarkdown } from './markdown';
import { instinctOf } from '../character/instinct';
import { normalizeThreatSheet } from '../character/threatSheet';
import { normalizeDiscovery } from '../character/discoveryBlock';
import type {
  CampaignGraph,
  CharacterKind,
  RawCampaignData,
  ResolvedCharacter,
  ResolvedLocation,
  ResolvedMap,
  ResolvedPin,
  ResolvedRelation,
  ResolvedSeason,
} from './types';

const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];

const KIND_BY_TYPE: Record<Character['type'], CharacterKind> = {
  PJ: 'pc',
  PNJ: 'npc',
  GROUPE: 'group',
  MENACE: 'threat',
  DISCOVERY: 'discovery',
};

const PLAYBOOK_NAME = new Map(PLAYBOOKS.map((p) => [p.key, p.name]));

/**
 * Resolve the raw RPC payloads into the shape every renderer reads. Pure: no
 * fetching, no store, no DOM. Always resolves the whole graph — section
 * filtering is a renderer concern, so a renderer that wants everything (an
 * export) needs no change here.
 */
export function traverse(raw: RawCampaignData): CampaignGraph {
  const nameById = new Map(raw.characters.map((c) => [c.id, c.name]));
  const locationNameById = new Map(raw.locations.map((l) => [l.id, l.name]));

  const { members, membershipRelationIds } = resolveGroupMembers(raw.characters, raw.relations);

  const memberOf = new Map<string, string[]>();
  for (const [groupId, memberIds] of members) {
    const groupName = nameById.get(groupId);
    if (!groupName) continue;
    for (const memberId of memberIds) {
      const list = memberOf.get(memberId) ?? [];
      list.push(groupName);
      memberOf.set(memberId, list);
    }
  }

  const relations: ResolvedRelation[] = [];
  const relationsByCharacter = new Map<string, ResolvedRelation[]>();
  for (const r of raw.relations) {
    if (membershipRelationIds.has(r.id)) continue;
    const fromName = nameById.get(r.from_character_id);
    const toName = nameById.get(r.to_character_id);
    if (!fromName || !toName) continue; // dangling edge — drop it
    const resolved: ResolvedRelation = {
      id: r.id,
      type: r.relation_type,
      typeLabel: getRelationType(r.relation_type).label,
      detail: r.relation_detail ?? '',
      from: { id: r.from_character_id, name: fromName },
      to: { id: r.to_character_id, name: toName },
      gmOnly: r.gm_only,
    };
    relations.push(resolved);
    for (const id of [r.from_character_id, r.to_character_id]) {
      const list = relationsByCharacter.get(id) ?? [];
      list.push(resolved);
      relationsByCharacter.set(id, list);
    }
  }

  const characters: ResolvedCharacter[] = raw.characters.map((c) => {
    const { playbook, rest } = parseRole(c.role ?? '');
    // Une MENACE n'a pas de rôle (cf. CharacterSheetPage) : ce que la colonne
    // porte encore sur une vieille fiche ne sort pas jusqu'au MCP, sinon le
    // brief décrirait une menace par un champ que l'app n'affiche plus.
    const role = c.type === 'MENACE' ? '' : (c.role ?? '');
    return {
      id: c.id,
      // ATTENTION à l'homonyme : ce `kind` est le CharacterKind de cette
      // couche (pc/npc/group/threat), dérivé de `c.type`. La colonne
      // `Character.kind` est autre chose — la catégorie de bestiaire
      // (lib/monsterKinds), qui ne sort pas jusqu'ici. Ne jamais écrire
      // `kind: c.kind`.
      kind: KIND_BY_TYPE[c.type],
      name: c.name,
      role,
      playbook: playbook ? (PLAYBOOK_NAME.get(playbook) ?? null) : null,
      roleRest: c.type === 'MENACE' ? '' : rest,
      locationName: c.location ? (locationNameById.get(c.location) ?? null) : null,
      instinct: instinctOf(c),
      notes: htmlToMarkdown(c.notes),
      gmNotes: htmlToMarkdown(c.gm_notes),
      tags: c.tags ?? [],
      traits: c.traits ?? [],
      gmOnly: c.gm_only,
      // Normalisation legacy (enjeux HTML, fatalité nue) à la frontière.
      threat: c.threat ? normalizeThreatSheet(c.threat) : null,
      discovery: normalizeDiscovery(c.discovery),
      memberOf: memberOf.get(c.id) ?? [],
      members: (members.get(c.id) ?? []).map((id) => nameById.get(id) ?? '').filter(Boolean),
      relations: relationsByCharacter.get(c.id) ?? [],
    };
  });

  const inhabitantsByLocation = new Map<string, string[]>();
  for (const c of raw.characters) {
    if (!c.location) continue;
    const list = inhabitantsByLocation.get(c.location) ?? [];
    list.push(c.name);
    inhabitantsByLocation.set(c.location, list);
  }

  const locations: ResolvedLocation[] = raw.locations.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description ?? '',
    notes: htmlToMarkdown(l.notes),
    gmNotes: htmlToMarkdown(l.gm_notes),
    tags: l.tags ?? [],
    gmOnly: l.gm_only,
    steading: l.steading ?? null,
    inhabitants: inhabitantsByLocation.get(l.id) ?? [],
  }));

  return {
    now: {
      year: raw.timeline?.current_year ?? null,
      season: raw.timeline?.current_season ?? null,
    },
    characters,
    locations,
    relations,
    membershipRelationIds: [...membershipRelationIds],
    chronicle: buildChronicle(raw),
    maps: buildMaps(raw, nameById, locationNameById),
    journal: raw.gmJournal
      ? {
          notes: htmlToMarkdown(raw.gmJournal.notes),
          wonders: (raw.gmJournal.wonders ?? []).map((w) => ({
            text: w.text,
            resolved: w.resolved,
            resolution: w.resolution ?? '',
          })),
        }
      : null,
    toneAndContent: raw.toneAndContent
      ? { notes: htmlToMarkdown(raw.toneAndContent.notes) }
      : null,
  };
}

/**
 * Pin coordinates are normalized 0..1 with the origin top-left, so words beat
 * numbers for a prose reader: y names north/south, x names west/east.
 */
export function pinPosition(x: number, y: number): string {
  const ns = y < 1 / 3 ? 'north' : y > 2 / 3 ? 'south' : '';
  const we = x < 1 / 3 ? 'west' : x > 2 / 3 ? 'east' : '';
  if (ns && we) return `${ns}-${we}`;
  return ns || we || 'center';
}

function buildMaps(
  raw: RawCampaignData,
  nameById: Map<string, string>,
  locationNameById: Map<string, string>,
): ResolvedMap[] {
  if (!raw.maps?.length) return [];
  const pinsByMap = new Map<string, ResolvedPin[]>();
  for (const p of raw.mapPins ?? []) {
    const linkedName = p.character_id
      ? nameById.get(p.character_id)
      : p.location_id
        ? locationNameById.get(p.location_id)
        : null;
    const name = linkedName ?? p.label ?? '';
    if (!name) continue; // dangling link and no label — nothing to say
    const list = pinsByMap.get(p.map_id) ?? [];
    list.push({
      id: p.id,
      name,
      characterId: p.character_id ?? null,
      locationId: p.location_id ?? null,
      note: p.note ?? '',
      position: pinPosition(p.x, p.y),
      gmOnly: p.gm_only,
    });
    pinsByMap.set(p.map_id, list);
  }
  return raw.maps.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description ?? '',
    locationName: m.location_id ? (locationNameById.get(m.location_id) ?? null) : null,
    gmOnly: m.gm_only,
    pins: pinsByMap.get(m.id) ?? [],
  }));
}

const STRAND_ORDER = { player: 0, gm: 1 } as const;

function buildChronicle(raw: RawCampaignData): ResolvedSeason[] {
  const out: ResolvedSeason[] = [];
  const strands: Array<{
    strand: 'player' | 'gm';
    entries: Record<string, TimelineEntry> | null;
  }> = [
    { strand: 'player', entries: raw.timeline?.entries ?? null },
    { strand: 'gm', entries: raw.timeline?.gm_entries ?? null },
  ];

  for (const { strand, entries } of strands) {
    if (!entries) continue;
    for (const [yearKey, seasons] of Object.entries(entries)) {
      const year = Number(yearKey);
      if (Number.isNaN(year) || !seasons) continue;
      for (const season of SEASON_ORDER) {
        const normalized = normalizeSeason(seasons[season]);
        const body = htmlToMarkdown(normalized.body);
        const title = normalized.title ?? '';
        if (!body && !title) continue;
        out.push({ year, season, strand, title, body });
      }
    }
  }

  return out.sort(
    (a, b) =>
      a.year - b.year ||
      SEASON_ORDER.indexOf(a.season) - SEASON_ORDER.indexOf(b.season) ||
      STRAND_ORDER[a.strand] - STRAND_ORDER[b.strand],
  );
}
