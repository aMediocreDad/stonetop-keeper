import { useCallback } from 'react';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import { mergePendingSteading, pendingSteading } from '@/lib/steading/steading';
import type { Location } from '@/types';

/**
 * Hook qui charge et expose les `Location` du space courant + opérations CRUD.
 * Souscrit aux changements (poll 1 s) pour rester en phase si plusieurs onglets.
 */
export function useLocations(spaceId: string | undefined) {
  const locations = useAppStore((s) => s.locations);
  const setLocations = useAppStore((s) => s.setLocations);
  const addLocation = useAppStore((s) => s.addLocation);
  const updateLocationInStore = useAppStore((s) => s.updateLocation);
  const removeLocation = useAppStore((s) => s.removeLocation);

  const {
    status,
    source,
    refetch: fetchLocations,
    retry,
  } = useCachedCollection<Location[]>({
    spaceId,
    collection: 'locations',
    fetcher: useCallback(() => db.getSpaceLocations(spaceId as string), [spaceId]),
    // `mergePendingSteading` is the pending-edit guard: it re-applies a
    // steading sheet still waiting on its debounce over whatever arrived.
    // Cache hydration goes through it for the same reason a realtime refetch
    // does — it is just another remote value landing on a local edit.
    merge: useCallback(
      (list: Location[]) => setLocations(mergePendingSteading(list)),
      [setLocations],
    ),
  });

  const createLocation = useCallback(
    async (input: { name: string; color: string }) => {
      if (!spaceId) throw new Error('No space');
      const loc = await db.createLocation({
        space_id: spaceId,
        name: input.name,
        color: input.color,
        gm_only: false,
      });
      addLocation(loc);
      return loc;
    },
    [spaceId, addLocation]
  );

  const updateLocation = useCallback(
    async (id: string, updates: Partial<Omit<Location, 'id' | 'space_id' | 'created_at'>>) => {
      const updated = await db.updateLocation(id, updates);
      // Ne pas écraser une édition de fiche en attente de flush (debounce).
      const pending = pendingSteading.get(id);
      const merged = pending ? { ...updated, steading: pending } : updated;
      updateLocationInStore(merged);
      return merged;
    },
    [updateLocationInStore]
  );

  const deleteLocation = useCallback(
    async (id: string) => {
      await db.deleteLocation(id);
      removeLocation(id);
    },
    [removeLocation]
  );

  return {
    locations,
    status,
    source,
    retry,
    fetchLocations,
    createLocation,
    updateLocation,
    deleteLocation,
  };
}
