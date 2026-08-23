// =====================================================================
// localStorage fallback used when Supabase env vars are NOT configured.
// No demo seed: the app starts empty, exactly like the production backend.
// Synchronous CRUD; consumed exclusively by `lib/db.ts`.
// =====================================================================
import type { Space, Character, Relation, Location, Timeline, CampaignMap, MapPin, GmJournal, ToneAndContent, Season, SeasonEntry } from '@/types';
import { TimelineConflictError, TimelineOccupiedError, toConflictEntry } from './timeline/timelineConflict';
import { normalizeSeason, storedRev } from './timeline/seasonEntry';
import { hasSeasonText, latestSeason } from './timeline/timelineRange';

const STORAGE_KEY = 'inkstone_local_data';

interface MockData {
  spaces: Space[];
  characters: Character[];
  relations: Relation[];
  locations: Location[];
  timelines: Timeline[];
  maps: CampaignMap[];
  mapPins: MapPin[];
  gmJournals: GmJournal[];
  toneAndContent: ToneAndContent[];
}

function emptyData(): MockData {
  return { spaces: [], characters: [], relations: [], locations: [], timelines: [], maps: [], mapPins: [], gmJournals: [], toneAndContent: [] };
}

function getData(): MockData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    return {
      spaces: parsed.spaces ?? [],
      characters: parsed.characters ?? [],
      relations: parsed.relations ?? [],
      locations: parsed.locations ?? [],
      timelines: parsed.timelines ?? [],
      maps: parsed.maps ?? [],
      mapPins: parsed.mapPins ?? [],
      gmJournals: parsed.gmJournals ?? [],
      toneAndContent: parsed.toneAndContent ?? [],
    };
  } catch {
    return emptyData();
  }
}

function saveData(d: MockData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const now = () => new Date().toISOString();

/** Récupère (ou crée) la frise du space — miroir de l'upsert Supabase. */
function ensureTimeline(data: MockData, spaceId: string): Timeline {
  let tl = data.timelines.find((t) => t.space_id === spaceId);
  if (!tl) {
    tl = {
      id: uid('tl'),
      space_id: spaceId,
      entries: {},
      current_year: null,
      current_season: null,
      updated_at: now(),
    };
    data.timelines.push(tl);
  }
  return tl;
}

/** Recalcule le marqueur « saison actuelle » depuis les entrées joueur. */
function deriveMarker(tl: Timeline): void {
  const latest = latestSeason(tl.entries);
  tl.current_year = latest?.year ?? null;
  tl.current_season = latest?.season ?? null;
}

// ----------------------------------------------------------------------
// Public sync API used by `lib/db.ts`
// ----------------------------------------------------------------------
export const localDb = {
  // ----- Spaces -----
  createSpace(input: Omit<Space, 'id' | 'created_at' | 'updated_at'>): Space {
    const data = getData();
    const space: Space = {
      ...input,
      id: uid('space'),
      created_at: now(),
      updated_at: now(),
    };
    data.spaces.push(space);
    saveData(data);
    return space;
  },

  findSpaceByCode(code: string): Space | null {
    return getData().spaces.find((s) => s.invite_code === code) ?? null;
  },

  updateSpace(id: string, updates: Partial<Omit<Space, 'id' | 'created_at'>>): Space {
    const data = getData();
    const i = data.spaces.findIndex((s) => s.id === id);
    if (i === -1) throw new Error('Space not found');
    data.spaces[i] = { ...data.spaces[i], ...updates, updated_at: now() };
    saveData(data);
    return data.spaces[i];
  },

  /** Suppression cascade : relations → characters → locations → space. */
  deleteSpace(spaceId: string): void {
    const data = getData();
    data.relations  = data.relations.filter((r) => r.space_id !== spaceId);
    data.characters = data.characters.filter((c) => c.space_id !== spaceId);
    data.locations  = data.locations.filter((l) => l.space_id !== spaceId);
    data.timelines  = data.timelines.filter((tl) => tl.space_id !== spaceId);
    data.mapPins    = data.mapPins.filter((p) => p.space_id !== spaceId);
    data.maps       = data.maps.filter((m) => m.space_id !== spaceId);
    data.gmJournals = data.gmJournals.filter((j) => j.space_id !== spaceId);
    data.toneAndContent = data.toneAndContent.filter((r) => r.space_id !== spaceId);
    data.spaces     = data.spaces.filter((s) => s.id !== spaceId);
    saveData(data);
  },


  // ----- Locations -----
  getSpaceLocations(spaceId: string): Location[] {
    return getData().locations.filter((l) => l.space_id === spaceId);
  },

  createLocation(input: Omit<Location, 'id' | 'created_at'>): Location {
    const data = getData();
    const loc: Location = { ...input, id: uid('loc'), created_at: now() };
    data.locations.push(loc);
    saveData(data);
    return loc;
  },

  updateLocation(id: string, updates: Partial<Omit<Location, 'id' | 'space_id' | 'created_at'>>): Location {
    const data = getData();
    const i = data.locations.findIndex((l) => l.id === id);
    if (i === -1) throw new Error('Location not found');
    data.locations[i] = { ...data.locations[i], ...updates };
    saveData(data);
    return data.locations[i];
  },

  deleteLocation(id: string): void {
    const data = getData();
    data.locations = data.locations.filter((l) => l.id !== id);
    data.characters.forEach((c) => {
      if (c.location === id) c.location = undefined;
    });
    data.maps.forEach((m) => {
      if (m.location_id === id) m.location_id = null;
    });
    data.mapPins = data.mapPins.filter((p) => p.location_id !== id);
    saveData(data);
  },

  // ----- Timeline (Chroniques) -----
  getTimeline(spaceId: string): Timeline | null {
    return getData().timelines.find((t) => t.space_id === spaceId) ?? null;
  },

  saveTimeline(
    spaceId: string,
    row: Pick<Timeline, 'entries' | 'current_year' | 'current_season' | 'updated_at'> & { space_id: string },
  ): Timeline {
    const data = getData();
    const i = data.timelines.findIndex((t) => t.space_id === spaceId);
    if (i === -1) {
      const tl: Timeline = { ...row, id: uid('tl') };
      data.timelines.push(tl);
      saveData(data);
      return tl;
    }
    data.timelines[i] = { ...data.timelines[i], ...row };
    saveData(data);
    return data.timelines[i];
  },

  saveGmTimeline(spaceId: string, gmEntries: Timeline['gm_entries']): Timeline {
    const data = getData();
    const i = data.timelines.findIndex((t) => t.space_id === spaceId);
    if (i === -1) {
      const tl: Timeline = {
        id: uid('tl'), space_id: spaceId, entries: {},
        current_year: null, current_season: null,
        gm_entries: gmEntries, updated_at: now(),
      };
      data.timelines.push(tl);
      saveData(data);
      return tl;
    }
    data.timelines[i] = { ...data.timelines[i], gm_entries: gmEntries, updated_at: now() };
    saveData(data);
    return data.timelines[i];
  },

  /**
   * Sauvegarde par saison avec compare-and-swap : refuse (TimelineConflictError,
   * portant l'entrée courante) si `baseRev` ne correspond plus. Miroir exact de
   * la RPC `save_timeline_entry`.
   */
  saveTimelineEntry(
    spaceId: string,
    year: number,
    season: Season,
    entry: { title?: string; body: string },
    baseRev: number,
  ): Timeline {
    const data = getData();
    const tl = ensureTimeline(data, spaceId);
    const yearKey = String(year);
    const current = tl.entries[yearKey]?.[season];
    if (storedRev(current) !== baseRev) throw new TimelineConflictError(toConflictEntry(current));
    const next: SeasonEntry = { body: entry.body, rev: baseRev + 1 };
    if (entry.title) next.title = entry.title;
    tl.entries = { ...tl.entries, [yearKey]: { ...(tl.entries[yearKey] || {}), [season]: next } };
    deriveMarker(tl);
    tl.updated_at = now();
    saveData(data);
    return tl;
  },

  /** Même CAS que `saveTimelineEntry`, sur le strand MJ — sans toucher le marqueur. */
  saveGmTimelineEntry(
    spaceId: string,
    year: number,
    season: Season,
    entry: { title?: string; body: string },
    baseRev: number,
  ): Timeline {
    const data = getData();
    const tl = ensureTimeline(data, spaceId);
    const yearKey = String(year);
    const gm = tl.gm_entries ?? {};
    const current = gm[yearKey]?.[season];
    if (storedRev(current) !== baseRev) throw new TimelineConflictError(toConflictEntry(current));
    const next: SeasonEntry = { body: entry.body, rev: baseRev + 1 };
    if (entry.title) next.title = entry.title;
    tl.gm_entries = { ...gm, [yearKey]: { ...(gm[yearKey] || {}), [season]: next } };
    tl.updated_at = now();
    saveData(data);
    return tl;
  },

  /**
   * Déplacement atomique d'une entrée. Refuse (TimelineOccupiedError) si la
   * cible a du texte ; la révision saute au-delà des deux emplacements pour
   * que toute sauvegarde partie d'un état antérieur au déplacement conflicte.
   */
  moveTimelineEntry(
    spaceId: string,
    from: { year: number; season: Season },
    to: { year: number; season: Season },
  ): Timeline {
    const data = getData();
    const tl = ensureTimeline(data, spaceId);
    if (from.year === to.year && from.season === to.season) return tl;
    const fromKey = String(from.year);
    const toKey = String(to.year);
    const moved = tl.entries[fromKey]?.[from.season];
    if (!hasSeasonText(moved)) return tl; // rien à déplacer : no-op
    const target = tl.entries[toKey]?.[to.season];
    if (hasSeasonText(target)) throw new TimelineOccupiedError();
    const norm = normalizeSeason(moved);
    const next: SeasonEntry = {
      body: norm.body,
      rev: Math.max(storedRev(moved), storedRev(target)) + 1,
    };
    if (norm.title) next.title = norm.title;
    const entries = { ...tl.entries };
    const src = { ...(entries[fromKey] || {}) };
    delete src[from.season];
    entries[fromKey] = src;
    entries[toKey] = { ...(entries[toKey] || {}), [to.season]: next };
    tl.entries = entries;
    deriveMarker(tl);
    tl.updated_at = now();
    saveData(data);
    return tl;
  },

  // ----- Characters -----
  getSpaceCharacters(spaceId: string): Character[] {
    return getData().characters.filter((c) => c.space_id === spaceId);
  },

  createCharacter(input: Omit<Character, 'id' | 'created_at' | 'updated_at'>): Character {
    const data = getData();
    const c: Character = { ...input, id: uid('char'), created_at: now(), updated_at: now() };
    data.characters.push(c);
    saveData(data);
    return c;
  },

  updateCharacter(id: string, updates: Partial<Character>): Character {
    const data = getData();
    const i = data.characters.findIndex((c) => c.id === id);
    if (i === -1) throw new Error('Character not found');
    data.characters[i] = { ...data.characters[i], ...updates, updated_at: now() };
    saveData(data);
    return data.characters[i];
  },

  deleteCharacter(id: string): void {
    const data = getData();
    data.characters = data.characters.filter((c) => c.id !== id);
    data.relations = data.relations.filter(
      (r) => r.from_character_id !== id && r.to_character_id !== id,
    );
    data.mapPins = data.mapPins.filter((p) => p.character_id !== id);
    saveData(data);
  },

  // ----- Relations -----
  getSpaceRelations(spaceId: string): Relation[] {
    return getData().relations.filter((r) => r.space_id === spaceId);
  },

  createRelation(input: Omit<Relation, 'id' | 'created_at'>): Relation {
    const data = getData();
    const r: Relation = { ...input, id: uid('rel'), created_at: now() };
    data.relations.push(r);
    saveData(data);
    return r;
  },

  updateRelation(
    id: string,
    updates: Partial<Pick<Relation, 'relation_type' | 'relation_detail' | 'gm_only'>>,
  ): Relation {
    const data = getData();
    const i = data.relations.findIndex((r) => r.id === id);
    if (i === -1) throw new Error('Relation not found');
    data.relations[i] = { ...data.relations[i], ...updates };
    saveData(data);
    return data.relations[i];
  },

  deleteRelation(id: string): void {
    const data = getData();
    data.relations = data.relations.filter((r) => r.id !== id);
    saveData(data);
  },

  // ----- Maps (cartes) -----
  getSpaceMaps(spaceId: string): CampaignMap[] {
    return getData().maps.filter((m) => m.space_id === spaceId);
  },

  createMap(input: Omit<CampaignMap, 'id' | 'created_at' | 'updated_at'>): CampaignMap {
    const data = getData();
    const map: CampaignMap = { ...input, id: uid('map'), created_at: now(), updated_at: now() };
    data.maps.push(map);
    saveData(data);
    return map;
  },

  updateMap(
    id: string,
    updates: Partial<Omit<CampaignMap, 'id' | 'space_id' | 'created_at'>>,
  ): CampaignMap {
    const data = getData();
    const i = data.maps.findIndex((m) => m.id === id);
    if (i === -1) throw new Error('NOT_FOUND');
    data.maps[i] = { ...data.maps[i], ...updates, updated_at: now() };
    saveData(data);
    return data.maps[i];
  },

  deleteMap(id: string): void {
    const data = getData();
    data.mapPins = data.mapPins.filter((p) => p.map_id !== id);
    data.maps = data.maps.filter((m) => m.id !== id);
    saveData(data);
  },

  // ----- Map pins (épingles) -----
  getMapPins(mapId: string): MapPin[] {
    return getData().mapPins.filter((p) => p.map_id === mapId);
  },

  createMapPin(input: Omit<MapPin, 'id' | 'created_at' | 'updated_at'>): MapPin {
    const data = getData();
    const pin: MapPin = { ...input, id: uid('pin'), created_at: now(), updated_at: now() };
    data.mapPins.push(pin);
    saveData(data);
    return pin;
  },

  updateMapPin(
    id: string,
    updates: Partial<Pick<MapPin, 'x' | 'y' | 'label' | 'note' | 'gm_only'>>,
  ): MapPin {
    const data = getData();
    const i = data.mapPins.findIndex((p) => p.id === id);
    if (i === -1) throw new Error('NOT_FOUND');
    data.mapPins[i] = { ...data.mapPins[i], ...updates, updated_at: now() };
    saveData(data);
    return data.mapPins[i];
  },

  deleteMapPin(id: string): void {
    const data = getData();
    data.mapPins = data.mapPins.filter((p) => p.id !== id);
    saveData(data);
  },

  // ----- GM journal (« I wonder... » + notes MJ) -----
  getGmJournal(spaceId: string): GmJournal | null {
    return getData().gmJournals.find((j) => j.space_id === spaceId) ?? null;
  },

  saveGmJournal(
    spaceId: string,
    patch: Partial<Pick<GmJournal, 'notes' | 'wonders'>>,
  ): GmJournal {
    const data = getData();
    const i = data.gmJournals.findIndex((j) => j.space_id === spaceId);
    if (i === -1) {
      const row: GmJournal = {
        id: uid('gmj'),
        space_id: spaceId,
        notes: patch.notes ?? '',
        wonders: patch.wonders ?? [],
        updated_at: now(),
      };
      data.gmJournals.push(row);
      saveData(data);
      return row;
    }
    // Fusion par présence de clé — même contrat que le RPC save_gm_journal.
    data.gmJournals[i] = {
      ...data.gmJournals[i],
      ...('notes' in patch ? { notes: patch.notes ?? '' } : {}),
      ...('wonders' in patch ? { wonders: patch.wonders ?? [] } : {}),
      updated_at: now(),
    };
    saveData(data);
    return data.gmJournals[i];
  },

  // ----- Tone & content (shared: Concept / Aim / Tone / Subject matter) -----
  getToneAndContent(spaceId: string): ToneAndContent | null {
    return getData().toneAndContent.find((r) => r.space_id === spaceId) ?? null;
  },

  saveToneAndContent(
    spaceId: string,
    patch: Partial<Pick<ToneAndContent, 'notes'>>,
  ): ToneAndContent {
    const data = getData();
    const i = data.toneAndContent.findIndex((r) => r.space_id === spaceId);
    if (i === -1) {
      const row: ToneAndContent = {
        id: uid('tac'),
        space_id: spaceId,
        notes: patch.notes ?? '',
        updated_at: now(),
      };
      data.toneAndContent.push(row);
      saveData(data);
      return row;
    }
    // Fusion par présence de clé — même contrat que le RPC save_tone_and_content.
    data.toneAndContent[i] = {
      ...data.toneAndContent[i],
      ...('notes' in patch ? { notes: patch.notes ?? '' } : {}),
      updated_at: now(),
    };
    saveData(data);
    return data.toneAndContent[i];
  },

  // ----- Realtime fallback (cross-tab polling) -----
  subscribe(spaceId: string, cb: () => void): () => void {
    let last = '';
    const tick = () => {
      const d = getData();
      const snap =
        JSON.stringify(d.characters.filter((c) => c.space_id === spaceId)) +
        JSON.stringify(d.relations.filter((r) => r.space_id === spaceId)) +
        JSON.stringify(d.locations.filter((l) => l.space_id === spaceId)) +
        JSON.stringify(d.timelines.filter((tl) => tl.space_id === spaceId)) +
        JSON.stringify(d.maps.filter((m) => m.space_id === spaceId)) +
        JSON.stringify(d.mapPins.filter((p) => p.space_id === spaceId)) +
        JSON.stringify(d.gmJournals.filter((j) => j.space_id === spaceId)) +
        JSON.stringify(d.toneAndContent.filter((r) => r.space_id === spaceId));
      if (last && last !== snap) cb();
      last = snap;
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  },
};
