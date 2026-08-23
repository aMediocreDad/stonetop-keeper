// =====================================================================
// Single data-access facade.
//
//  - When Supabase env vars are configured  → real backend.
//  - Otherwise                              → localStorage fallback
//                                              (no demo seed; empty start).
//
// All hooks (`useSpace`, `useCharacters`, `useRelations`, `useLocations`)
// import from this module, never from supabase.ts or mockDb.ts directly.
//
// SECURITY MODEL (Supabase backend)
// ---------------------------------------------------------------------
//   The tables are NOT directly accessible with the anon key anymore
//   (RLS denies everything). Every operation goes through a SECURITY
//   DEFINER RPC that requires a per-space session TOKEN, issued only
//   after the space password is verified server-side. See
//   `supabase-security-migration.sql`. The token lives in the Zustand
//   session and is read here at call time.
// =====================================================================
import type {
  CampaignMap,
  Character,
  GmJournal,
  Location,
  MapImageUpload,
  MapPin,
  Relation,
  RevisionEvent,
  Season,
  Space,
  SpaceRole,
  SpaceSession,
  Timeline,
  TimelineEntry,
  TimelineStrand,
  ToneAndContent,
  UndoPlan,
  UndoResult,
} from '@/types';
import {
  getCachedMapUrl,
  setCachedMapUrl,
  invalidateMapImageCache,
} from '@/lib/map/mapImageUrlCache';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getSupabase,
  isSupabaseConfigured,
  generateInviteCode,
  hashPassword,
  verifyPassword,
} from './supabase';
import { localDb } from './mockDb';
import { followerOf, isFollower, kindOf } from '@/lib/character/statblock';
import {
  ERR_OFFLINE,
  isNetworkError,
  markNetworkFailure,
  markNetworkSuccess,
} from './offline/connectivity';
import { getMapBlob } from './offline/mapBlobs';
import { migrateRelationType } from './constants';
import { useAppStore } from '@/stores/appStore';
import { timelineErrorFromRpc } from './timeline/timelineConflict';

// ----- Public stable error codes (matched by the UI for translation) -----
export const ERR_WRONG_PASSWORD = 'WRONG_PASSWORD';
export const ERR_SPACE_NOT_FOUND = 'SPACE_NOT_FOUND';
export const ERR_FORBIDDEN = 'FORBIDDEN';
/** No ledger without the Supabase backend — mockDb has no capture layer. */
export const ERR_LEDGER_UNAVAILABLE = 'LEDGER_UNAVAILABLE';
/**
 * Transport failure, as opposed to anything the server chose to answer.
 * Defined in `offline/connectivity` because `isNetworkError` must recognise
 * it after this module re-throws; re-exported here so the UI keeps importing
 * every stable error code from one place.
 */
export { ERR_OFFLINE };

// Current space token (from the persisted session). Empty when logged out.
function authToken(): string {
  return useAppStore.getState().session?.token ?? '';
}

// Role of the active session — drives local read filtering (GM layer).
// Defaults to 'gm' for legacy/no-session states (see appStore migration).
function currentRole(): SpaceRole {
  return useAppStore.getState().session?.role ?? 'gm';
}

// Map a Postgres/PostgREST error from an auth RPC to our stable codes.
function mapAuthError(message: string | undefined): Error {
  const m = message ?? '';
  if (m.includes('WRONG_PASSWORD')) return new Error(ERR_WRONG_PASSWORD);
  if (m.includes('SPACE_NOT_FOUND')) return new Error(ERR_SPACE_NOT_FOUND);
  if (m.includes('FORBIDDEN')) return new Error(ERR_FORBIDDEN);
  return new Error(m || 'UNKNOWN_ERROR');
}

// A locally-minted token for the no-backend (localStorage) fallback.
function localToken(spaceId: string): string {
  return btoa(`${spaceId}:${Date.now()}`);
}

// ----------------------------------------------------------------------
// Spaces — return a full SpaceSession ({ space, token, isAdmin }) so the
// caller can open the session with a server-issued token.
// ----------------------------------------------------------------------
async function createSpace(
  name: string,
  gmPassword: string,
  playerPassword?: string,
): Promise<SpaceSession> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('create_space', {
      p_name: name,
      p_password: gmPassword,
      p_player_password: playerPassword ?? null,
    });
    if (error) throw mapAuthError(error.message);
    return {
      space: data.space as Space,
      token: data.token as string,
      isAdmin: Boolean(data.is_admin),
      role: (data.role as SpaceRole) ?? 'gm',
    };
  }

  const invite_code = generateInviteCode();
  const password_hash = hashPassword(gmPassword);
  const player_password_hash = playerPassword ? hashPassword(playerPassword) : undefined;
  const space = localDb.createSpace({
    name,
    invite_code,
    password_hash,
    player_password_hash,
    public_read: false,
  });
  return { space, token: localToken(space.id), isAdmin: true, role: 'gm' };
}

async function joinSpace(inviteCode: string, password: string): Promise<SpaceSession> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('join_space', {
      p_invite_code: inviteCode,
      p_password: password,
    });
    if (error) throw mapAuthError(error.message);
    return {
      space: data.space as Space,
      token: data.token as string,
      isAdmin: Boolean(data.is_admin),
      // Fallback for a not-yet-migrated server that doesn't return `role` yet.
      role: (data.role as SpaceRole) ?? (data.is_admin ? 'gm' : 'player'),
    };
  }

  const space = localDb.findSpaceByCode(inviteCode);
  if (!space) throw new Error(ERR_SPACE_NOT_FOUND);
  // Mirrors the server RPC's password-resolution order: empty password only
  // works when the space opted into public read access.
  if (password === '' && space.public_read) {
    return { space, token: localToken(space.id), isAdmin: false, role: 'viewer' };
  }
  if (verifyPassword(password, space.password_hash ?? '')) {
    return { space, token: localToken(space.id), isAdmin: true, role: 'gm' };
  }
  if (space.player_password_hash && verifyPassword(password, space.player_password_hash)) {
    return { space, token: localToken(space.id), isAdmin: false, role: 'player' };
  }
  throw new Error(ERR_WRONG_PASSWORD);
}

/**
 * Update the grimoire's settings (GM/player passwords, public reading).
 * Re-verifies the current GM password before any write.
 *  - Supabase: `update_space_settings` RPC.
 *  - localStorage: local check, then `localDb.updateSpace`.
 */
async function updateSpaceSettings(
  currentPassword: string,
  data: { gm_password?: string; player_password?: string; public_read?: boolean },
): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.rpc('update_space_settings', {
      p_token: authToken(),
      p_current_password: currentPassword,
      p_data: data,
    });
    if (error) throw mapAuthError(error.message);
    return;
  }

  const spaceId = useAppStore.getState().session?.space.id;
  if (!spaceId) throw new Error(ERR_SPACE_NOT_FOUND);
  const allSpaces =
    JSON.parse(localStorage.getItem('inkstone_local_data') || '{}').spaces ?? [];
  const target = allSpaces.find((s: Space) => s.id === spaceId);
  if (!target) throw new Error(ERR_SPACE_NOT_FOUND);
  if (!verifyPassword(currentPassword, target.password_hash ?? '')) {
    throw new Error(ERR_WRONG_PASSWORD);
  }

  const patch: Partial<Omit<Space, 'id' | 'created_at'>> = {};
  if (data.gm_password !== undefined) patch.password_hash = hashPassword(data.gm_password);
  if (data.player_password !== undefined) {
    patch.player_password_hash =
      data.player_password === '' ? undefined : hashPassword(data.player_password);
  }
  if (data.public_read !== undefined) patch.public_read = data.public_read;

  localDb.updateSpace(spaceId, patch);
}

/**
 * Delete a grimoire outright — cascading.
 *  - Supabase side: the `delete_space` RPC re-verifies the password
 *    server-side, then deletes the child tables and the space.
 *  - localStorage side: local check, then deletion.
 * Throws ERR_WRONG_PASSWORD or ERR_SPACE_NOT_FOUND.
 */
async function deleteSpace(spaceId: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    // Best-effort image purge before the deletion (the delete_space RPC does
    // not touch Storage; an orphaned object is unreachable but still costs
    // storage).
    const maps = await getSpaceMaps(spaceId).catch(() => []);
    await Promise.all(
      maps.filter((m) => m.image_path).map((m) => deleteMapImage(m.id).catch(() => undefined)),
    );
    const { error } = await sb.rpc('delete_space', {
      p_token: authToken(),
      p_password: password,
    });
    if (error) throw mapAuthError(error.message);
    return;
  }

  const allSpaces =
    JSON.parse(localStorage.getItem('inkstone_local_data') || '{}').spaces ?? [];
  const target = allSpaces.find((s: Space) => s.id === spaceId);
  if (!target) throw new Error(ERR_SPACE_NOT_FOUND);
  if (!verifyPassword(password, target.password_hash ?? '')) {
    throw new Error(ERR_WRONG_PASSWORD);
  }
  localDb.deleteSpace(spaceId);
}

// ----------------------------------------------------------------------
// Local read filtering — dev parity only (NOT a security boundary): the
// localStorage fallback has no server to enforce RLS, so we reproduce the
// same gm_only/gm_notes/gm_entries hiding a non-GM would get from Supabase.
// ----------------------------------------------------------------------
function filterLocationsForRole(locations: Location[]): Location[] {
  if (currentRole() === 'gm') return locations;
  return locations.filter((l) => !l.gm_only).map((l) => ({ ...l, gm_notes: null }));
}

function filterCharactersForRole(characters: Character[]): Character[] {
  if (currentRole() === 'gm') return characters;
  return characters
    .filter((c) => !c.gm_only)
    .map((c) => {
      // Server parity (app_character_row_for_role): PJ and followers keep
      // instinct/statblock; otherwise we also mask the legacy threat.instinct
      // fallback (instinctOf would otherwise fall back to it).
      if (c.type === 'PJ' || isFollower(c)) return { ...c, gm_notes: null };
      // Only the MECHANICS go (instinct, stat block). `kind`, `tags` and
      // `follower` stay: that is description — what a table observes of a
      // creature it can see. The only revelation switch is `gm_only`, which
      // hides the whole row.
      return {
        ...c, gm_notes: null, instinct: '', statblock: null,
        threat: c.threat ? { ...c.threat, instinct: '' } : c.threat,
      };
    });
}

function filterRelationsForRole(relations: Relation[], spaceId: string): Relation[] {
  if (currentRole() === 'gm') return relations;
  const hiddenIds = new Set(
    localDb
      .getSpaceCharacters(spaceId)
      .filter((c) => c.gm_only)
      .map((c) => c.id),
  );
  return relations
    .filter((r) => !r.gm_only)
    .filter((r) => !hiddenIds.has(r.from_character_id) && !hiddenIds.has(r.to_character_id));
}

function filterTimelineForRole(timeline: Timeline | null): Timeline | null {
  if (!timeline || currentRole() === 'gm') return timeline;
  return { ...timeline, gm_entries: null };
}

function filterMapsForRole(maps: CampaignMap[]): CampaignMap[] {
  if (currentRole() === 'gm') return maps;
  return maps.filter((m) => !m.gm_only);
}

function filterMapPinsForRole(pins: MapPin[], spaceId: string): MapPin[] {
  if (currentRole() === 'gm') return pins;
  const hiddenChars = new Set(
    localDb.getSpaceCharacters(spaceId).filter((c) => c.gm_only).map((c) => c.id),
  );
  const hiddenLocs = new Set(
    localDb.getSpaceLocations(spaceId).filter((l) => l.gm_only).map((l) => l.id),
  );
  return pins.filter(
    (p) =>
      !p.gm_only &&
      !(p.character_id && hiddenChars.has(p.character_id)) &&
      !(p.location_id && hiddenLocs.has(p.location_id)),
  );
}

// ----------------------------------------------------------------------
// Locations
// ----------------------------------------------------------------------
async function getSpaceLocations(spaceId: string): Promise<Location[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_locations', { p_token: authToken() });
    if (error) throw error;
    return (data ?? []) as Location[];
  }
  return filterLocationsForRole(localDb.getSpaceLocations(spaceId));
}

async function createLocation(input: Omit<Location, 'id' | 'created_at'>): Promise<Location> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('create_location', { p_token: authToken(), p_data: input });
    if (error) throw error;
    return data as Location;
  }
  return localDb.createLocation(input);
}

async function updateLocation(
  id: string,
  updates: Partial<Omit<Location, 'id' | 'space_id' | 'created_at'>>,
): Promise<Location> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('update_location', {
      p_token: authToken(),
      p_id: id,
      p_data: updates,
    });
    if (error) throw error;
    return data as Location;
  }
  return localDb.updateLocation(id, updates);
}

async function deleteLocation(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.rpc('delete_location', { p_token: authToken(), p_id: id });
    if (error) throw error;
    return;
  }
  return localDb.deleteLocation(id);
}

// ----------------------------------------------------------------------
// Timeline (Chronicles) — one timeline per space, stored as a single block.
// ----------------------------------------------------------------------
async function getTimeline(spaceId: string): Promise<Timeline | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_timeline', { p_token: authToken() });
    if (error) throw error;
    const rows = (data ?? []) as Timeline[];
    return rows[0] ?? null;
  }
  return filterTimelineForRole(localDb.getTimeline(spaceId));
}

async function saveTimeline(
  spaceId: string,
  patch: Pick<Timeline, 'entries'> &
    Partial<Pick<Timeline, 'current_year' | 'current_season'>>,
): Promise<Timeline> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('save_timeline', {
      p_token: authToken(),
      p_data: {
        entries: patch.entries,
        current_year: patch.current_year ?? null,
        current_season: patch.current_season ?? null,
      },
    });
    if (error) throw error;
    return data as Timeline;
  }
  return localDb.saveTimeline(spaceId, {
    space_id: spaceId,
    entries: patch.entries,
    current_year: patch.current_year ?? null,
    current_season: patch.current_season ?? null,
    updated_at: new Date().toISOString(),
  });
}

/** The timeline's GM strand — separate from `entries`, never returned to non-GMs. */
async function saveGmTimeline(
  spaceId: string,
  gmEntries: Record<string, TimelineEntry>,
): Promise<Timeline> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('save_gm_timeline', {
      p_token: authToken(),
      p_data: { gm_entries: gmEntries },
    });
    if (error) throw error;
    return data as Timeline;
  }
  return localDb.saveGmTimeline(spaceId, gmEntries);
}

/**
 * Save ONE season with compare-and-swap (`p_base_rev`). Rejects with a
 * TimelineConflictError (carrying the current entry) if the revision is
 * stale — never a silent overwrite of a concurrent edit.
 */
async function saveTimelineEntry(
  spaceId: string,
  year: number,
  season: Season,
  entry: { title?: string; body: string },
  baseRev: number,
): Promise<Timeline> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('save_timeline_entry', {
      p_token: authToken(),
      p_year: year,
      p_season: season,
      p_entry: { title: entry.title ?? null, body: entry.body },
      p_base_rev: baseRev,
    });
    if (error) throw timelineErrorFromRpc(error);
    return data as Timeline;
  }
  return localDb.saveTimelineEntry(spaceId, year, season, entry, baseRev);
}

/** Same CAS on the GM strand (the RPC is GM-gated server-side). */
async function saveGmTimelineEntry(
  spaceId: string,
  year: number,
  season: Season,
  entry: { title?: string; body: string },
  baseRev: number,
): Promise<Timeline> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('save_gm_timeline_entry', {
      p_token: authToken(),
      p_year: year,
      p_season: season,
      p_entry: { title: entry.title ?? null, body: entry.body },
      p_base_rev: baseRev,
    });
    if (error) throw timelineErrorFromRpc(error);
    return data as Timeline;
  }
  return localDb.saveGmTimelineEntry(spaceId, year, season, entry, baseRev);
}

/** Atomic server-side move — rejects with TimelineOccupiedError if the target has text. */
async function moveTimelineEntry(
  spaceId: string,
  from: { year: number; season: Season },
  to: { year: number; season: Season },
): Promise<Timeline> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('move_timeline_entry', {
      p_token: authToken(),
      p_from_year: from.year,
      p_from_season: from.season,
      p_to_year: to.year,
      p_to_season: to.season,
    });
    if (error) throw timelineErrorFromRpc(error);
    return data as Timeline;
  }
  return localDb.moveTimelineEntry(spaceId, from, to);
}

// ----------------------------------------------------------------------
// GM journal — "I wonder…" + GM notes, one row per space, GM only.
// ----------------------------------------------------------------------
async function getGmJournal(spaceId: string): Promise<GmJournal | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_gm_journal', { p_token: authToken() });
    if (error) throw error;
    const rows = (data ?? []) as GmJournal[];
    return rows[0] ?? null;
  }
  // Server parity: a hidden row == an absent row for non-GMs.
  if (currentRole() !== 'gm') return null;
  return localDb.getGmJournal(spaceId);
}

async function saveGmJournal(
  spaceId: string,
  patch: Partial<Pick<GmJournal, 'notes' | 'wonders'>>,
): Promise<GmJournal> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('save_gm_journal', {
      p_token: authToken(),
      p_data: patch,
    });
    if (error) throw error;
    return data as GmJournal;
  }
  if (currentRole() !== 'gm') throw new Error(ERR_FORBIDDEN);
  return localDb.saveGmJournal(spaceId, patch);
}

// ----------------------------------------------------------------------
// Tone & content — the table's shared agreement, one row per space.
// Unlike the GM journal, EVERY role reads it; only player and gm write.
// ----------------------------------------------------------------------
async function getToneAndContent(spaceId: string): Promise<ToneAndContent | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_tone_and_content', { p_token: authToken() });
    if (error) throw error;
    const rows = (data ?? []) as ToneAndContent[];
    return rows[0] ?? null;
  }
  return localDb.getToneAndContent(spaceId);
}

async function saveToneAndContent(
  spaceId: string,
  patch: Partial<Pick<ToneAndContent, 'notes'>>,
): Promise<ToneAndContent> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('save_tone_and_content', {
      p_token: authToken(),
      p_data: patch,
    });
    if (error) throw error;
    return data as ToneAndContent;
  }
  // Server parity with save_tone_and_content's role check.
  if (currentRole() === 'viewer') throw new Error(ERR_FORBIDDEN);
  return localDb.saveToneAndContent(spaceId, patch);
}

// ----------------------------------------------------------------------
// Characters
// ----------------------------------------------------------------------
function normalizeChar(c: Character): Character {
  return {
    ...c,
    instinct: c.instinct ?? '',
    traits: c.traits ?? [],
    tags: c.tags ?? [],
    gm_only: c.gm_only ?? false,
    // Permanent fallback, like instinct/kind/follower: the offline
    // localStorage cache and restoring a revision older than the column both
    // hand back a row without the key.
    dead: c.dead ?? false,
    statblock: c.statblock ?? null,
    // Fall back to the old nested shape: a row restored from a pre-migration
    // revision still carries kind/follower inside the block (cf.
    // kindOf/followerOf). We hoist them here so that EVERYTHING else in the
    // app — including isFollower on the filter side — reads the flat fields.
    kind: kindOf(c),
    follower: followerOf(c),
  };
}

async function getSpaceCharacters(spaceId: string): Promise<Character[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_characters', { p_token: authToken() });
    if (error) throw error;
    return ((data ?? []) as Character[]).map(normalizeChar);
  }
  return filterCharactersForRole(localDb.getSpaceCharacters(spaceId).map(normalizeChar));
}

async function createCharacter(
  character: Omit<Character, 'id' | 'created_at' | 'updated_at'>,
): Promise<Character> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('create_character', {
      p_token: authToken(),
      p_data: character,
    });
    if (error) throw error;
    return normalizeChar(data as Character);
  }
  return normalizeChar(localDb.createCharacter(character));
}

async function updateCharacter(id: string, updates: Partial<Character>): Promise<Character> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('update_character', {
      p_token: authToken(),
      p_id: id,
      p_data: updates,
    });
    if (error) throw error;
    return normalizeChar(data as Character);
  }
  const patch = { ...updates, updated_at: new Date().toISOString() };
  return normalizeChar(localDb.updateCharacter(id, patch));
}

async function deleteCharacter(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.rpc('delete_character', { p_token: authToken(), p_id: id });
    if (error) throw error;
    return;
  }
  return localDb.deleteCharacter(id);
}

// ----------------------------------------------------------------------
// Relations
// ----------------------------------------------------------------------
function normalizeRel(r: Relation): Relation {
  return { ...r, relation_type: migrateRelationType(r.relation_type) };
}

async function getSpaceRelations(spaceId: string): Promise<Relation[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_relations', { p_token: authToken() });
    if (error) throw error;
    return ((data ?? []) as Relation[]).map(normalizeRel);
  }
  return filterRelationsForRole(localDb.getSpaceRelations(spaceId).map(normalizeRel), spaceId);
}

async function createRelation(rel: Omit<Relation, 'id' | 'created_at'>): Promise<Relation> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('create_relation', { p_token: authToken(), p_data: rel });
    if (error) throw error;
    return normalizeRel(data as Relation);
  }
  return normalizeRel(localDb.createRelation(rel));
}

async function updateRelation(
  id: string,
  updates: Partial<Pick<Relation, 'relation_type' | 'relation_detail' | 'gm_only'>>,
): Promise<Relation> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('update_relation', {
      p_token: authToken(),
      p_id: id,
      p_data: updates,
    });
    if (error) throw error;
    return normalizeRel(data as Relation);
  }
  return normalizeRel(localDb.updateRelation(id, updates));
}

async function deleteRelation(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.rpc('delete_relation', { p_token: authToken(), p_id: id });
    if (error) throw error;
    return;
  }
  return localDb.deleteRelation(id);
}

// ----------------------------------------------------------------------
// Maps (illustrated maps) + pins. The image itself goes through the Edge
// Function (see uploadMapImage/getMapImageUrl, a dedicated task).
// ----------------------------------------------------------------------
async function getSpaceMaps(spaceId: string): Promise<CampaignMap[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_maps', { p_token: authToken() });
    if (error) throw error;
    return (data ?? []) as CampaignMap[];
  }
  return filterMapsForRole(localDb.getSpaceMaps(spaceId));
}

async function createMap(
  input: Omit<CampaignMap, 'id' | 'created_at' | 'updated_at'>,
): Promise<CampaignMap> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('create_map', { p_token: authToken(), p_data: input });
    if (error) throw mapAuthError(error.message);
    return data as CampaignMap;
  }
  return localDb.createMap(input);
}

async function updateMap(
  id: string,
  updates: Partial<Pick<CampaignMap, 'name' | 'description' | 'location_id' | 'thumb' | 'gm_only'>>,
): Promise<CampaignMap> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('update_map', {
      p_token: authToken(),
      p_id: id,
      p_data: updates,
    });
    if (error) throw mapAuthError(error.message);
    return data as CampaignMap;
  }
  return localDb.updateMap(id, updates);
}

async function deleteMap(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await deleteMapImage(id).catch(() => undefined);
    const { error } = await sb.rpc('delete_map', { p_token: authToken(), p_id: id });
    if (error) throw mapAuthError(error.message);
    return;
  }
  localDb.deleteMap(id);
}

async function getMapPins(spaceId: string, mapId: string): Promise<MapPin[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('get_map_pins', {
      p_token: authToken(),
      p_map_id: mapId,
    });
    if (error) throw mapAuthError(error.message);
    return (data ?? []) as MapPin[];
  }
  const map = localDb.getSpaceMaps(spaceId).find((m) => m.id === mapId);
  if (!map || (currentRole() !== 'gm' && map.gm_only)) throw new Error('NOT_FOUND');
  return filterMapPinsForRole(localDb.getMapPins(mapId), spaceId);
}

async function createMapPin(
  input: Omit<MapPin, 'id' | 'created_at' | 'updated_at'>,
): Promise<MapPin> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('create_map_pin', { p_token: authToken(), p_data: input });
    if (error) throw mapAuthError(error.message);
    return data as MapPin;
  }
  return localDb.createMapPin(input);
}

async function updateMapPin(
  id: string,
  updates: Partial<Pick<MapPin, 'x' | 'y' | 'label' | 'note' | 'gm_only'>>,
): Promise<MapPin> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc('update_map_pin', {
      p_token: authToken(),
      p_id: id,
      p_data: updates,
    });
    if (error) throw mapAuthError(error.message);
    return data as MapPin;
  }
  return localDb.updateMapPin(id, updates);
}

async function deleteMapPin(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.rpc('delete_map_pin', { p_token: authToken(), p_id: id });
    if (error) throw mapAuthError(error.message);
    return;
  }
  localDb.deleteMapPin(id);
}

// ----------------------------------------------------------------------
// Map image — a private bucket behind the `map-image` Edge Function
// (server-side validation: size, magic bytes, dimensions). The signed URLs
// (~1 h) are cached in memory per map — the cache is extracted into
// `mapImageUrlCache.ts` so the store can purge it on sign-out without
// importing db.ts (a cycle). See that module for the object-URL revocation
// discipline.
// ----------------------------------------------------------------------

// FunctionsHttpError carries the Response in `context`, so we surface the
// stable error code ({error: 'FORBIDDEN'}) rather than a generic message.
async function functionsError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && typeof body.error === 'string') return mapAuthError(body.error);
    } catch {
      // corps non-JSON — on retombe sur le message brut
    }
  }
  return error instanceof Error ? error : new Error('UNKNOWN_ERROR');
}

async function uploadMapImage(mapId: string, image: MapImageUpload): Promise<CampaignMap> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.functions.invoke('map-image/upload', {
      body: image.blob,
      headers: {
        'x-space-token': authToken(),
        'x-map-id': mapId,
        'Content-Type': image.blob.type,
      },
    });
    if (error) throw await functionsError(error);
    // A key versioned by `updated_at` would be enough for FRESHNESS (the new
    // row misses the cache by itself), but not for MEMORY: the old version's
    // entry — potentially an object URL pinning a multi-MB Blob — would never
    // be looked up or revoked again.
    invalidateMapImageCache(mapId);
    return data.map as CampaignMap;
  }
  // localStorage fallback: a downscaled data URL (~5 MB quota — dev only).
  return localDb.updateMap(mapId, {
    image_data: image.dataUrl,
    image_path: `local/${mapId}`,
    image_width: image.width,
    image_height: image.height,
  });
}

async function getMapImageUrl(map: CampaignMap): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return map.image_data ?? null;
  if (!map.image_path) return null;
  // Key versioned by `updated_at` (not just `map.id`): replacing an image in
  // place (same `image_path`) yields a fresh `updated_at`, which deliberately
  // misses the cache — otherwise a client already sitting on the map would
  // keep serving the old signed URL (and so the old bytes, via the browser's
  // HTTP cache) until the TTL expires (~1h).
  const cacheKey = `${map.id}:${map.updated_at}`;
  const hit = getCachedMapUrl(cacheKey);
  // An object URL over cached bytes is already the best answer; nothing to do.
  if (hit?.objectUrl) return hit.url;

  // Cached bytes BEFORE a remembered signed URL. Order is load-bearing: a
  // signed URL lives ~1h in this map, so viewing a map online and then losing
  // the connection inside that hour used to keep returning the signed URL —
  // which cannot load offline — while the bytes sat unused in IndexedDB. That
  // was "Could not load the map image" with no error to explain it. Preferring
  // local bytes also skips a Storage round trip while online.
  // Falls back to the active session's space. Callers legitimately pass a
  // PARTIAL map here — `MapViewerPage` narrows it to the fields that should
  // trigger a re-sign — and omitting `space_id` silently keyed the blob lookup
  // on "undefined", so it missed every time and quietly served the signed URL
  // instead. Deriving it the same way `authToken()` does means no caller can
  // get it wrong again.
  const spaceId = map.space_id ?? useAppStore.getState().session?.space.id ?? '';
  const cachedBytes = await getMapBlob(spaceId, map);
  if (cachedBytes) {
    const url = URL.createObjectURL(cachedBytes);
    // Replaces any signed-URL entry under the same key.
    setCachedMapUrl(cacheKey, { url, expiresAt: Infinity, objectUrl: true });
    return url;
  }

  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;

  const { data, error } = await sb.functions.invoke('map-image/view-url', {
    body: { token: authToken(), mapId: map.id },
  });
  if (error) throw await functionsError(error);
  setCachedMapUrl(cacheKey, {
    url: data.url as string,
    expiresAt: Date.now() + (data.expiresIn as number) * 1000,
  });
  return data.url as string;
}

/**
 * Downloads a map's bytes for the offline cache. Separate from
 * `getMapImageUrl` because the prefetch sweep wants the blob itself, not a URL
 * — and must not populate the in-memory URL cache for maps nobody opened.
 */
async function fetchMapImageBytes(map: CampaignMap): Promise<Blob> {
  const sb = getSupabase();
  if (!sb) throw new Error('NO_BACKEND');
  const { data, error } = await sb.functions.invoke('map-image/view-url', {
    body: { token: authToken(), mapId: map.id },
  });
  if (error) throw await functionsError(error);
  const res = await fetch(data.url as string);
  if (!res.ok) throw new Error(`IMAGE_FETCH_${res.status}`);
  return res.blob();
}

async function deleteMapImage(mapId: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.functions.invoke('map-image/delete', {
      body: { token: authToken(), mapId },
    });
    if (error) throw await functionsError(error);
    invalidateMapImageCache(mapId);
    return;
  }
  localDb.updateMap(mapId, {
    image_data: null,
    image_path: null,
    image_width: null,
    image_height: null,
  });
}

// ----------------------------------------------------------------------
// Realtime — subscribe to all space-scoped changes.
//
// Returns an unsubscribe function. Works with both backends:
//  - Supabase: a SINGLE broadcast channel per space is shared between
//              hooks. The DB broadcasts a content-free "change" ping on
//              `space-{id}` after any insert/update/delete (see the
//              migration's triggers); each ping triggers a refetch.
//              postgres_changes can no longer be used because RLS now
//              denies the anon role SELECT access.
//  - localStorage: falls back to a 1 s polling loop.
//
// The same channel also carries editing-presence for the Chronicle: who
// else is currently writing in which year/season/strand (see
// `subscribeEditingPresence` / `trackEditing` / `untrackEditing` below).
// ----------------------------------------------------------------------

/** Editing presence broadcast on the space channel: "so-and-so is writing here". */
export interface EditingPresence {
  year: number;
  season: Season;
  strand: TimelineStrand;
  role: SpaceRole;
}

type SbChannelEntry = {
  ch: RealtimeChannel;
  listeners: Set<() => void>;
  presenceListeners: Set<(peers: EditingPresence[]) => void>;
  /** The presence payload THIS tab wants — re-sent on (re)connect. */
  tracked: EditingPresence | null;
  subscribed: boolean;
};
const _channelsBySpace: Map<string, SbChannelEntry> = new Map();

// A per-tab presence key: lets us exclude our own presence from the fan-out
// (we don't show ourselves as "writing" to ourselves).
const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function acquireSpaceChannel(spaceId: string): SbChannelEntry | null {
  const sb = getSupabase();
  if (!sb) return null;
  const existing = _channelsBySpace.get(spaceId);
  if (existing) return existing;

  const entry: SbChannelEntry = {
    ch: null as unknown as RealtimeChannel,
    listeners: new Set(),
    presenceListeners: new Set(),
    tracked: null,
    subscribed: false,
  };
  const ch = sb
    .channel(`space-${spaceId}`, { config: { presence: { key: TAB_ID } } })
    .on('broadcast', { event: 'change' }, () => entry.listeners.forEach((fn) => fn()))
    .on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, (EditingPresence & { presence_ref: string })[]>;
      const peers = Object.entries(state)
        .filter(([key]) => key !== TAB_ID)
        .flatMap(([, metas]) => metas)
        .filter((p) => typeof p?.year === 'number' && typeof p?.season === 'string');
      entry.presenceListeners.forEach((fn) => fn(peers));
    })
    .subscribe((status) => {
      entry.subscribed = status === 'SUBSCRIBED';
      // Realtime loses presence state on reconnect, so we re-send it.
      if (entry.subscribed && entry.tracked) void ch.track(entry.tracked);
    });
  entry.ch = ch;
  _channelsBySpace.set(spaceId, entry);
  return entry;
}

function releaseSpaceChannel(spaceId: string): void {
  const sb = getSupabase();
  const entry = _channelsBySpace.get(spaceId);
  if (!sb || !entry) return;
  if (entry.listeners.size === 0 && entry.presenceListeners.size === 0 && entry.tracked === null) {
    sb.removeChannel(entry.ch);
    _channelsBySpace.delete(spaceId);
  }
}

export function subscribeSpace(spaceId: string, onChange: () => void): () => void {
  const entry = acquireSpaceChannel(spaceId);
  if (entry) {
    entry.listeners.add(onChange);
    return () => {
      entry.listeners.delete(onChange);
      releaseSpaceChannel(spaceId);
    };
  }
  return localDb.subscribe(spaceId, onChange);
}

/** Listen to the space's editing presence. No-op (empty list) in localStorage mode. */
export function subscribeEditingPresence(
  spaceId: string,
  cb: (peers: EditingPresence[]) => void,
): () => void {
  const entry = acquireSpaceChannel(spaceId);
  if (!entry) return () => {};
  entry.presenceListeners.add(cb);
  return () => {
    entry.presenceListeners.delete(cb);
    releaseSpaceChannel(spaceId);
  };
}

/** Announce "this tab is writing in this season". Replaces the previous announcement. */
export function trackEditing(spaceId: string, payload: EditingPresence): void {
  const entry = acquireSpaceChannel(spaceId);
  if (!entry) return;
  entry.tracked = payload;
  if (entry.subscribed) void entry.ch.track(payload);
}

/** Withdraw this tab's announcement (editor closed / leaving the page). */
export function untrackEditing(spaceId: string): void {
  const entry = _channelsBySpace.get(spaceId);
  if (!entry) return;
  if (entry.tracked !== null) {
    entry.tracked = null;
    if (entry.subscribed) void entry.ch.untrack();
  }
  releaseSpaceChannel(spaceId);
}

// ----------------------------------------------------------------------
// Revisions (Ledger) — GM-only, Supabase-only. The localStorage fallback
// has no capture layer, so it refuses rather than faking a history.
// ----------------------------------------------------------------------
async function getRevisions(limit = 25, beforeId?: number): Promise<RevisionEvent[]> {
  const sb = getSupabase();
  if (!sb) throw new Error(ERR_LEDGER_UNAVAILABLE);
  const { data, error } = await sb.rpc('get_revisions', {
    p_token: authToken(),
    p_limit: limit,
    p_before_id: beforeId ?? null,
  });
  if (error) throw mapAuthError(error.message);
  return (data ?? []) as RevisionEvent[];
}

// `expectEventId` (optional): for a grouped ledger card, the run's NEWEST
// event -- passed alongside `eventId` (the run's OLDEST, the actual revert
// target) so the server can report `group_intact` per row: does the row's
// CURRENT state still match what that newest event left behind, right now,
// at preview time? See preview_undo_event's own comment (supabase-revisions.sql)
// for why this can't be decided client-side from the grouping alone -- the
// grouping is computed when the card renders, not when the GM confirms.
async function previewUndoEvent(eventId: string, expectEventId?: string): Promise<UndoPlan> {
  const sb = getSupabase();
  if (!sb) throw new Error(ERR_LEDGER_UNAVAILABLE);
  const { data, error } = await sb.rpc('preview_undo_event', {
    p_token: authToken(),
    p_event_id: eventId,
    p_expect_event_id: expectEventId ?? null,
  });
  if (error) throw mapAuthError(error.message);
  return data as UndoPlan;
}

async function undoEvent(eventId: string): Promise<UndoResult> {
  const sb = getSupabase();
  if (!sb) throw new Error(ERR_LEDGER_UNAVAILABLE);
  const { data, error } = await sb.rpc('undo_event', {
    p_token: authToken(),
    p_event_id: eventId,
  });
  if (error) throw mapAuthError(error.message);
  return data as UndoResult;
}

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// Connectivity + offline mapping, applied once at the facade boundary.
//
// Every operation in this module already funnels through the object below, so
// wrapping it here beats editing ~30 `if (error) throw error` sites — and,
// more importantly, means a new RPC added later cannot forget to participate.
//
// Two jobs:
//   1. Feed `connectivity.ts` the empirical signal it needs (a real request
//      succeeded / failed at the transport layer).
//   2. Turn a transport failure into the stable `ERR_OFFLINE` code, so the UI
//      can say "you're offline" instead of a generic save error.
//
// Application errors (WRONG_PASSWORD, FORBIDDEN, a Postgres SQLSTATE) pass
// through untouched and explicitly do NOT flag the app offline — see
// `isNetworkError`, which discriminates on the error code, not the prose.
// ----------------------------------------------------------------------
function withConnectivity<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      const result = await fn(...args);
      markNetworkSuccess();
      return result;
    } catch (err) {
      if (isNetworkError(err)) {
        markNetworkFailure();
        throw new Error(ERR_OFFLINE);
      }
      throw err;
    }
  };
}

function wrapFacade<T extends object>(facade: T): T {
  return Object.fromEntries(
    Object.entries(facade).map(([name, fn]) => [
      name,
      withConnectivity(fn as (...args: unknown[]) => Promise<unknown>),
    ]),
  ) as T;
}

const rawDb = {
  // Spaces
  createSpace,
  joinSpace,
  deleteSpace,
  updateSpaceSettings,

  // Locations
  getSpaceLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  // Timeline (Chroniques)
  getTimeline,
  saveTimeline,
  saveGmTimeline,
  saveTimelineEntry,
  saveGmTimelineEntry,
  moveTimelineEntry,
  // GM journal
  getGmJournal,
  saveGmJournal,
  // Tone & content
  getToneAndContent,
  saveToneAndContent,
  // Characters
  getSpaceCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  // Relations
  getSpaceRelations,
  createRelation,
  updateRelation,
  deleteRelation,
  // Maps
  getSpaceMaps,
  createMap,
  updateMap,
  deleteMap,
  getMapPins,
  createMapPin,
  updateMapPin,
  deleteMapPin,
  // Map images
  uploadMapImage,
  getMapImageUrl,
  fetchMapImageBytes,
  deleteMapImage,

  // Revisions (Ledger)
  getRevisions,
  previewUndoEvent,
  undoEvent,
};

export const db = wrapFacade(rawDb);

export { isSupabaseConfigured };
