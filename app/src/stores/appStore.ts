import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { purgeAll, purgeSpace } from '@/lib/offline/snapshotCache';
import { purgeAllBlobs, purgeSpaceBlobs } from '@/lib/offline/mapBlobs';
import { clearMapImageUrlCache } from '@/lib/map/mapImageUrlCache';
import type {
  CampaignMap,
  Character,
  CharacterType,
  Location,
  Relation,
  Space,
  SpaceSession,
} from '@/types';

/** The dashboard's type filter: a `CharacterType`, or `'all'` for no filter. */
export type CharacterFilter = CharacterType | 'all';

// Cached reads are role-filtered server-side, so leaving a space (or re-joining
// it as someone else) has to take the snapshots AND the map bytes with it —
// otherwise a GM's plum layer stays legible to whoever picks up the device
// next. Fire-and-forget on purpose: a failing IndexedDB must never be able to
// block signing out.
function dropCache(spaceId: string, role?: SpaceSession['role']): void {
  void purgeSpace(spaceId, role);
  // Blobs are not role-keyed — a GM-only map's bytes are as sensitive as its
  // row, so any purge of a space takes all of them.
  void purgeSpaceBlobs(spaceId);
  // And the in-memory URL cache: its object URLs pin those same bytes in RAM,
  // and a signed URL for a GM-only map must not survive a role downgrade.
  clearMapImageUrlCache();
}

function dropAllCaches(): void {
  void purgeAll();
  void purgeAllBlobs();
  clearMapImageUrlCache();
}

// A single toast timer: without cancellation, a previous toast's timer would
// cut the next one down mid-display.
let toastTimer: ReturnType<typeof setTimeout> | null = null;

interface AppState {
  // Space session(s) — multi-space: `sessions` holds every grimoire this device
  // has a token for; `session` is the active one. Switching just re-points
  // `session` at a held entry; space-scoped data reloads (hooks key on space id).
  session: SpaceSession | null;
  sessions: Record<string, SpaceSession>;
  setSession: (session: SpaceSession | null) => void;
  updateSessionSpace: (patch: Partial<Space>) => void;
  switchSpace: (spaceId: string) => void;
  leaveSpace: (spaceId: string) => void;
  clearSession: () => void;

  // Characters
  characters: Character[];
  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  updateCharacter: (character: Character) => void;
  removeCharacter: (id: string) => void;

  // Relations
  relations: Relation[];
  setRelations: (relations: Relation[]) => void;
  addRelation: (relation: Relation) => void;
  updateRelation: (relation: Relation) => void;
  removeRelation: (id: string) => void;

  // Locations (lieux personnalisables)
  locations: Location[];
  setLocations: (locations: Location[]) => void;
  addLocation: (location: Location) => void;
  updateLocation: (location: Location) => void;
  removeLocation: (id: string) => void;

  // Maps (illustrated maps)
  maps: CampaignMap[];
  setMaps: (maps: CampaignMap[]) => void;
  addMap: (map: CampaignMap) => void;
  updateMap: (map: CampaignMap) => void;
  removeMap: (id: string) => void;

  // UI - filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  /** `'all'` = no filtering. These sentinels are UI-only and NOT persisted
   *  (see `partialize` below), so they are free to be English even though the
   *  `CharacterType` codes they sit beside are French column values. */
  filterType: CharacterFilter;
  setFilterType: (type: CharacterFilter) => void;
  /**
   * `'all'` = no filtering, otherwise a Location id.
   * `'no-location'` = only characters with no `location`.
   */
  filterLocationId: string;
  setFilterLocationId: (id: string) => void;
  isGraphView: boolean;
  setIsGraphView: (value: boolean) => void;

  // Loading
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Toast
  toast: { message: string; visible: boolean } | null;
  showToast: (message: string) => void;
  hideToast: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Session
      session: null,
      sessions: {},
      // Enter (create/join) a space: it becomes active AND is registered in the
      // held-spaces map. Data arrays reset so the new space's content loads fresh.
      setSession: (session) =>
        set((state) => {
          if (!session) return { session: null };
          // Re-entering a space we already hold, but as a different role: the
          // role is decided by which password was used at join, so this is how
          // a GM becomes a player on the same device. The snapshots we hold
          // are the GM's, and they must not survive the downgrade.
          const held = state.sessions[session.space.id];
          if (held && held.role !== session.role) {
            dropCache(session.space.id, held.role);
          }
          return {
            session,
            sessions: { ...state.sessions, [session.space.id]: session },
            characters: [],
            relations: [],
            locations: [],
            maps: [],
          };
        }),
      // Patch the active space in place (e.g. after a settings save) without
      // resetting characters/relations/locations — those arrays are keyed on
      // space id, which doesn't change here, so a setSession-style reset would
      // just leave the dashboard empty until reload/switch. No-op if nothing
      // is active. Kept in sync with `sessions`, same as setSession.
      updateSessionSpace: (patch) =>
        set((state) => {
          if (!state.session) return {};
          const space = { ...state.session.space, ...patch };
          const session = { ...state.session, space };
          return { session, sessions: { ...state.sessions, [space.id]: session } };
        }),
      // Activate an already-held space (the switcher). Reloads space-scoped data.
      switchSpace: (spaceId) =>
        set((state) => {
          const next = state.sessions[spaceId];
          if (!next || next.space.id === state.session?.space.id) return {};
          return { session: next, characters: [], relations: [], locations: [], maps: [] };
        }),
      // Drop a held space (deleted or left). If it was active, fall back to any
      // remaining held space, else sign out.
      leaveSpace: (spaceId) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[spaceId];
          dropCache(spaceId);
          if (state.session?.space.id !== spaceId) return { sessions };
          const nextId = Object.keys(sessions)[0];
          return {
            sessions,
            session: nextId ? sessions[nextId] : null,
            characters: [],
            relations: [],
            locations: [],
            maps: [],
          };
        }),
      // Full sign-out: forget every held space, cache included.
      clearSession: () => {
        dropAllCaches();
        set({ session: null, sessions: {}, characters: [], relations: [], locations: [], maps: [] });
      },

      // Characters
      characters: [],
      setCharacters: (characters) => set({ characters }),
      addCharacter: (character) =>
        set((state) => ({ characters: [...state.characters, character] })),
      updateCharacter: (character) =>
        set((state) => ({
          characters: state.characters.map((c) => (c.id === character.id ? character : c)),
        })),
      removeCharacter: (id) =>
        set((state) => ({
          characters: state.characters.filter((c) => c.id !== id),
          relations: state.relations.filter(
            (r) => r.from_character_id !== id && r.to_character_id !== id
          ),
        })),

      // Relations
      relations: [],
      setRelations: (relations) => set({ relations }),
      addRelation: (relation) =>
        set((state) => ({ relations: [...state.relations, relation] })),
      updateRelation: (relation) =>
        set((state) => ({
          relations: state.relations.map((r) => (r.id === relation.id ? relation : r)),
        })),
      removeRelation: (id) =>
        set((state) => ({ relations: state.relations.filter((r) => r.id !== id) })),

      // Locations
      locations: [],
      setLocations: (locations) => set({ locations }),
      addLocation: (location) =>
        set((state) => ({ locations: [...state.locations, location] })),
      updateLocation: (location) =>
        set((state) => ({
          locations: state.locations.map((l) => (l.id === location.id ? location : l)),
        })),
      removeLocation: (id) =>
        set((state) => ({
          locations: state.locations.filter((l) => l.id !== id),
          // Reset le `location` des personnages locaux qui pointaient vers ce lieu
          characters: state.characters.map((c) =>
            c.location === id ? { ...c, location: undefined } : c
          ),
        })),

      // Maps
      maps: [],
      setMaps: (maps) => set({ maps }),
      // Idempotent by id: an optimistic add can race the realtime refetch's
      // setMaps, which would otherwise duplicate the row (React dup-key warning).
      addMap: (map) =>
        set((state) =>
          state.maps.some((m) => m.id === map.id) ? state : { maps: [...state.maps, map] },
        ),
      updateMap: (map) =>
        set((state) => ({ maps: state.maps.map((m) => (m.id === map.id ? map : m)) })),
      removeMap: (id) => set((state) => ({ maps: state.maps.filter((m) => m.id !== id) })),

      // UI
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      filterType: 'all',
      setFilterType: (type) => set({ filterType: type }),
      filterLocationId: 'all',
      setFilterLocationId: (id) => set({ filterLocationId: id }),
      isGraphView: false,
      setIsGraphView: (value) => set({ isGraphView: value }),

      // Loading
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Toast
      toast: null,
      showToast: (message) => {
        if (toastTimer) clearTimeout(toastTimer);
        set({ toast: { message, visible: true } });
        // 4s, not 2.5: under magnification or a screen reader, the only
        // confirmation that an action succeeded was vanishing before it could
        // be read (WCAG 2.2.1). Messages stay to one short sentence.
        toastTimer = setTimeout(() => set({ toast: null }), 4000);
      },
      hideToast: () => set({ toast: null }),
    }),
    {
      name: 'inkstone-storage',
      version: 2,
      partialize: (state) => ({ session: state.session, sessions: state.sessions }),
      // v0 persisted only `session`; seed the multi-space map from it so the
      // already-active grimoire shows up in the switcher after upgrading.
      // v1 → v2: sessions gain `role` — everyone had full rights before the
      // GM layer existed, so backfill 'gm' (keeps an existing role if present).
      migrate: (persisted) => {
        const s = (persisted ?? {}) as {
          session?: SpaceSession | null;
          sessions?: Record<string, SpaceSession>;
        };
        if (s.session && !s.sessions) {
          s.sessions = { [s.session.space.id]: s.session };
        }
        const withRole = (session?: SpaceSession | null) =>
          session ? { ...session, role: session.role ?? 'gm' } : session;
        s.session = withRole(s.session) ?? null;
        if (s.sessions) {
          s.sessions = Object.fromEntries(
            Object.entries(s.sessions).map(([id, session]) => [id, withRole(session)!]),
          );
        }
        return s as AppState;
      },
    }
  )
);
