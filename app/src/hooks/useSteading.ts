import { useCallback, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { isNetworkError, subscribeConnectivity } from '@/lib/offline/connectivity';
import { findSteadingLocation, pendingSteading } from '@/lib/steading/steading';
import {
  createDefaultSteading,
  STONETOP_COLOR,
  STONETOP_DESCRIPTION,
  STONETOP_NAME,
} from '@/lib/steading/steadingSeed';
import { useI18n, useT } from '@/i18n';
import type { Steading } from '@/types';

const SAVE_DEBOUNCE_MS = 600;

/**
 * Fiche de bourgade : mises à jour optimistes du store + persistance
 * debouncée de la SEULE colonne `steading` (même esprit que useTimeline ;
 * conflits = dernier qui écrit gagne, choix assumé du blob unique).
 *
 * Le registre `pendingSteading` (lib/steading) joue le rôle de `dirtyRef`
 * dans useTimeline : il capture la valeur en cours de debounce pour que les
 * refetchs temps-réel de useLocations ne clobbèrent pas une saisie locale.
 */
export function useSteading(spaceId: string | undefined) {
  const { lang } = useI18n();
  const t = useT();
  const locations = useAppStore((s) => s.locations);
  const updateLocationInStore = useAppStore((s) => s.updateLocation);
  const addLocation = useAppStore((s) => s.addLocation);
  const showToast = useAppStore((s) => s.showToast);

  const steadingLocation = findSteadingLocation(locations);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Persists one location's pending steading sheet immediately. Shared by the
  // debounce timer, the unmount flush and the reconnect flush.
  const flushSteading = useCallback(
    async (locationId: string) => {
      const pending = pendingSteading.get(locationId);
      if (!pending) return;
      try {
        await db.updateLocation(locationId, { steading: pending });
        // Only clear if nothing newer arrived while this was in flight.
        if (pendingSteading.get(locationId) === pending) pendingSteading.delete(locationId);
      } catch (err) {
        // The pending entry deliberately survives: `mergePendingSteading` keeps
        // re-applying it over every refetch until a save actually lands.
        console.error('[Steading] save failed:', err);
        // Network failure ≠ failure: the pending entry is queued and the
        // reconnect flush below will send it — telling the user to retry
        // work the app already holds was wrong on both counts.
        showToast(t(isNetworkError(err) ? 'offline.saveBlocked' : 'steading.saveError'));
      }
    },
    [showToast, t],
  );

  const flushRef = useRef(flushSteading);
  useEffect(() => {
    flushRef.current = flushSteading;
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      // Leaving inside the debounce window used to drop the edit: the timer
      // was cleared and nothing replaced it. The value survived in
      // `pendingSteading` and kept being re-applied to the store, so the sheet
      // LOOKED saved right up until a reload proved otherwise. Flush instead.
      for (const [locationId, timer] of timers) {
        clearTimeout(timer);
        void flushRef.current(locationId);
      }
      timers.clear();
    };
  }, []);

  // Reconnect: a sheet left pending by a failed save has no timer to retry it.
  useEffect(
    () =>
      subscribeConnectivity((online) => {
        if (!online) return;
        for (const locationId of [...pendingSteading.keys()]) {
          void flushRef.current(locationId);
        }
      }),
    [],
  );

  const mutateSteading = useCallback(
    (locationId: string, producer: (cur: Steading) => Steading) => {
      const loc = useAppStore.getState().locations.find((l) => l.id === locationId);
      if (!loc?.steading) return;
      const next = producer(loc.steading);
      pendingSteading.set(locationId, next);
      updateLocationInStore({ ...loc, steading: next });

      const timers = timersRef.current;
      const existing = timers.get(locationId);
      if (existing) clearTimeout(existing);
      timers.set(
        locationId,
        setTimeout(() => {
          timers.delete(locationId);
          void flushRef.current(locationId);
        }, SAVE_DEBOUNCE_MS),
      );
    },
    [updateLocationInStore],
  );

  /** CTA « créer la fiche » : crée le lieu Stonetop, ou upgrade l'existant. */
  const setupSteading = useCallback(async () => {
    if (!spaceId) throw new Error('No space');
    const seed = createDefaultSteading(lang);
    const existing = useAppStore
      .getState()
      .locations.find(
        (l) =>
          l.space_id === spaceId && l.name.trim().toLowerCase() === STONETOP_NAME.toLowerCase(),
      );

    if (existing) {
      if (existing.steading) return existing;
      const updated = await db.updateLocation(existing.id, {
        steading: seed,
        description: existing.description || STONETOP_DESCRIPTION[lang],
      });
      updateLocationInStore(updated);
      return updated;
    }
    const created = await db.createLocation({
      space_id: spaceId,
      name: STONETOP_NAME,
      color: STONETOP_COLOR,
      description: STONETOP_DESCRIPTION[lang],
      notes: '',
      tags: [],
      steading: seed,
      gm_only: false,
    });
    addLocation(created);
    return created;
  }, [spaceId, lang, addLocation, updateLocationInStore]);

  /** « Promouvoir en bourgade » un lieu quelconque (fiche seedée standard). */
  const promoteLocation = useCallback(
    async (locationId: string) => {
      const updated = await db.updateLocation(locationId, {
        steading: createDefaultSteading(lang),
      });
      updateLocationInStore(updated);
      return updated;
    },
    [lang, updateLocationInStore],
  );

  return { steadingLocation, mutateSteading, setupSteading, promoteLocation };
}
