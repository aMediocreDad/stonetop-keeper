import { useCallback, useEffect, useRef, useState } from 'react';
import { db, subscribeSpace } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import {
  countSavedMaps,
  evictStaleBlobs,
  prefetchMaps,
} from '@/lib/offline/mapBlobs';
import type { CampaignMap, MapImageUpload, MapPin } from '@/types';

/**
 * Cartes du space courant + CRUD, calqué sur useLocations : fetch au
 * montage, refetch sur ping realtime, état partagé dans le store.
 *
 * SANS le balayage offline. C'est la variante que montent les fiches
 * (PinnedOnMaps, MapsOfPlace) et les formulaires : elles ont besoin de la
 * liste, pas du téléchargement eager de chaque image multi-Mo — monter le
 * balayage depuis une fiche de personnage déclenchait des dizaines de Mo de
 * transfert pour afficher une rangée de boutons « épinglé sur ».
 */
export function useMapsData(spaceId: string | undefined) {
  const maps = useAppStore((s) => s.maps);
  const setMaps = useAppStore((s) => s.setMaps);
  const addMap = useAppStore((s) => s.addMap);
  const updateMapInStore = useAppStore((s) => s.updateMap);
  const removeMap = useAppStore((s) => s.removeMap);

  const {
    status,
    source,
    refetch: fetchMaps,
    retry,
  } = useCachedCollection<CampaignMap[]>({
    spaceId,
    collection: 'maps',
    fetcher: useCallback(() => db.getSpaceMaps(spaceId as string), [spaceId]),
    merge: useCallback((list: CampaignMap[]) => setMaps(list), [setMaps]),
  });

  const createMap = useCallback(
    async (input: {
      name: string;
      description?: string | null;
      location_id?: string | null;
      thumb?: string | null;
      gm_only?: boolean;
    }) => {
      if (!spaceId) throw new Error('No space');
      const map = await db.createMap({ space_id: spaceId, gm_only: false, ...input });
      addMap(map);
      return map;
    },
    [spaceId, addMap],
  );

  const updateMap = useCallback(
    async (
      id: string,
      updates: Partial<Pick<CampaignMap, 'name' | 'description' | 'location_id' | 'thumb' | 'gm_only'>>,
    ) => {
      const updated = await db.updateMap(id, updates);
      updateMapInStore(updated);
      return updated;
    },
    [updateMapInStore],
  );

  const deleteMap = useCallback(
    async (id: string) => {
      await db.deleteMap(id);
      removeMap(id);
    },
    [removeMap],
  );

  const uploadImage = useCallback(
    async (mapId: string, image: MapImageUpload) => {
      const updated = await db.uploadMapImage(mapId, image);
      updateMapInStore(updated);
      return updated;
    },
    [updateMapInStore],
  );

  return { maps, status, source, retry, fetchMaps, createMap, updateMap, deleteMap, uploadImage };
}

// The sweep guard, module-scoped and keyed by space. It has to hold across
// hook INSTANCES, not just across one instance's effect re-runs: the Maps page
// and the viewer can overlap during navigation, and a per-instance ref let the
// two run the same multi-MB downloads concurrently. `next` always holds the
// newest maps list; the running loop drains it, so a sweep never works from a
// stale closure and a request arriving mid-sweep is never dropped.
type SweepState = { running: boolean; next: CampaignMap[] | null };
const _sweepBySpace = new Map<string, SweepState>();

/** Tests only — each case wants a fresh guard. */
export function resetMapSweepsForTests(): void {
  _sweepBySpace.clear();
}

/**
 * `useMapsData` + le balayage offline eager (éviction des octets périmés,
 * préchargement des images manquantes). À monter uniquement sur les surfaces
 * carte (MapsPage, MapViewerPage) — voir useMapsData pour pourquoi.
 */
export function useMaps(spaceId: string | undefined) {
  const data = useMapsData(spaceId);
  const { maps } = data;

  // Eager offline sweep, in two independent halves.
  //
  // Counting and downloading are deliberately NOT the same effect. When they
  // were, the count was a casualty of the sweep's own lifecycle: cache
  // hydration started a sweep, the network result then replaced the `maps`
  // array, that cancelled the first sweep's count write AND made the second
  // run bail on the in-flight guard without rescheduling. Nothing ever wrote
  // the count, so the Maps page sat on "0 of N saved" forever — and, being
  // component-local state, said it again on every navigation.
  const [savedCount, setSavedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // True until the hook itself unmounts. Distinct from any single effect
  // instance's lifetime — see the sweep's `finally` for why that matters.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Half one: what is on disk, read straight from IndexedDB. Cheap, always
  // safe to re-run, and never gated on a download succeeding.
  const [countTick, setCountTick] = useState(0);
  useEffect(() => {
    if (!spaceId || maps.length === 0) return;
    let cancelled = false;
    void countSavedMaps(spaceId, maps).then((n) => {
      if (!cancelled) setSavedCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [spaceId, maps, countTick]);

  // Half two: the download sweep. Serialised through the module-level,
  // space-keyed guard above, because a sweep cannot be cancelled mid-download
  // and two overlapping ones would fetch the same bytes twice. A list arriving
  // during a sweep lands in `next` rather than being dropped — that dropped
  // work was the original defect.
  useEffect(() => {
    if (!spaceId || maps.length === 0) return;

    let state = _sweepBySpace.get(spaceId);
    if (!state) {
      state = { running: false, next: null };
      _sweepBySpace.set(spaceId, state);
    }
    // Hand the newest list over unconditionally; a running loop drains it.
    state.next = maps;
    if (state.running) return;

    const run = async (s: SweepState) => {
      s.running = true;
      try {
        while (s.next) {
          const batch = s.next;
          s.next = null;
          await evictStaleBlobs(spaceId, batch);
          const withImages = batch.filter((m) => m.image_path).length;
          const outstanding = withImages - (await countSavedMaps(spaceId, batch));
          if (outstanding > 0 && mountedRef.current) setSyncing(true);
          await prefetchMaps(spaceId, batch, (m) => db.fetchMapImageBytes(m));
        }
      } finally {
        s.running = false;
        // Guarded on UNMOUNT, not on this effect instance being superseded —
        // a superseded instance skipping the write while the new one bails on
        // the running guard is the same dropped-work bug, one layer down.
        if (mountedRef.current) {
          setSyncing(false);
          // Re-read from disk rather than trusting the sweep's bookkeeping.
          setCountTick((t) => t + 1);
        }
      }
    };

    void run(state);
  }, [spaceId, maps]);

  return {
    ...data,
    /**
     * Offline availability of the full map images. `syncing` is true only
     * while a download is actually outstanding — the progress line has no
     * business appearing once there is nothing left to do.
     */
    offlineImages: (() => {
      const total = maps.filter((m) => m.image_path).length;
      // Clamped rather than reset from an effect: switching space leaves
      // `savedCount` holding the previous space's number until its own count
      // lands, and "5 of 2 saved" is worse than briefly undercounting.
      return { saved: Math.min(savedCount, total), total, syncing };
    })(),
  };
}

/**
 * Épingles pointant vers UNE fiche (personnage ou lieu), toutes cartes
 * visibles confondues — la fiche affiche « épinglé sur telle carte ».
 * `get_map_pins` est par carte, donc éventail d'appels sur la liste du store
 * (quelques cartes par grimoire, pas des centaines).
 */
export function useEntityPins(
  spaceId: string | undefined,
  entity: { characterId?: string; locationId?: string },
) {
  const maps = useAppStore((s) => s.maps);
  const [hits, setHits] = useState<Array<{ pin: MapPin; map: CampaignMap }>>([]);
  const { characterId, locationId } = entity;

  const fetchHits = useCallback(async () => {
    if (!spaceId || (!characterId && !locationId) || maps.length === 0) {
      setHits([]);
      return;
    }
    try {
      const perMap = await Promise.all(
        maps.map(async (m) =>
          (await db.getMapPins(spaceId, m.id)).map((pin) => ({ pin, map: m })),
        ),
      );
      setHits(
        perMap
          .flat()
          .filter(({ pin }) =>
            characterId ? pin.character_id === characterId : pin.location_id === locationId,
          ),
      );
    } catch (err) {
      // Une carte supprimée entre le fetch de la liste et celui des épingles
      // (NOT_FOUND) : on garde l'état courant, le prochain ping réconcilie.
      console.error('[Maps] entity pins fetch failed:', err);
    }
  }, [spaceId, characterId, locationId, maps]);

  useEffect(() => {
    if (!spaceId) return;
    // Même schéma fetch-puis-set que useMapPins ci-dessous (faux positif lint).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHits();
    // Coalescé comme useCachedCollection : le fan-out est de N RPC (une par
    // carte), donc une rafale de pings multiplie N par la taille de la rafale.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeSpace(spaceId, () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void fetchHits();
      }, 250);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsub();
    };
  }, [spaceId, fetchHits]);

  return hits;
}

/**
 * Épingles d'UNE carte — état local au hook (seul le viewer les consomme),
 * refetch sur ping realtime. `pinsError` capte NOT_FOUND (carte masquée).
 */
export function useMapPins(spaceId: string | undefined, mapId: string | undefined) {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [pinsError, setPinsError] = useState<string | null>(null);

  // Remise à zéro pendant le rendu quand la carte change (pattern React
  // « adjusting state when props change ») — pas dans l'effet (lint) et
  // sans flash : l'ancien état n'est jamais rendu pour la nouvelle carte.
  const identity = `${spaceId ?? ''}:${mapId ?? ''}`;
  const [prevIdentity, setPrevIdentity] = useState(identity);
  if (identity !== prevIdentity) {
    setPrevIdentity(identity);
    setPins([]);
    setPinsError(null);
  }

  // Pins go through the same cache-first path as every other collection.
  // Without it, an offline map rendered with no pins at all — which removes
  // most of the reason to look at the map. Keyed per map because the RPC is.
  const { refetch: fetchPins } = useCachedCollection<MapPin[]>({
    spaceId: mapId ? spaceId : undefined,
    collection: `mapPins:${mapId ?? ''}`,
    fetcher: useCallback(() => db.getMapPins(spaceId as string, mapId as string), [spaceId, mapId]),
    merge: useCallback((list: MapPin[]) => {
      setPins(list);
      setPinsError(null);
    }, []),
    onError: useCallback((e: unknown) => {
      // A cached snapshot already on screen must not be replaced by an error
      // wall just because the network is gone.
      setPinsError((prev) => prev ?? (e instanceof Error ? e.message : 'UNKNOWN_ERROR'));
    }, []),
  });

  const createPin = useCallback(
    async (input: Omit<MapPin, 'id' | 'space_id' | 'map_id' | 'created_at' | 'updated_at'>) => {
      if (!spaceId || !mapId) throw new Error('No map');
      const pin = await db.createMapPin({ ...input, space_id: spaceId, map_id: mapId });
      setPins((prev) => [...prev, pin]);
      return pin;
    },
    [spaceId, mapId],
  );

  const updatePin = useCallback(
    async (id: string, updates: Partial<Pick<MapPin, 'x' | 'y' | 'label' | 'note' | 'gm_only'>>) => {
      // Optimiste : applique tout de suite les champs modifiés localement
      // (élimine le snap-back visuel au drop d'un pin glissé — le composant
      // de drag repasse à la position `pins[]` dès le pointerup, avant que
      // le serveur ait répondu). La ligne serveur réconciliée remplace cet
      // état optimiste à la résolution ; un échec déclenche un refetch
      // complet pour revenir à la vérité serveur plutôt que de laisser
      // l'état local optimiste divergent.
      setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      try {
        const pin = await db.updateMapPin(id, updates);
        setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
        return pin;
      } catch (err) {
        fetchPins().catch(() => undefined);
        throw err;
      }
    },
    [fetchPins],
  );

  const deletePin = useCallback(async (id: string) => {
    await db.deleteMapPin(id);
    setPins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { pins, pinsError, createPin, updatePin, deletePin };
}
