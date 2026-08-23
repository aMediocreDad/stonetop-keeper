import { useCallback } from 'react';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import type { Relation } from '@/types';

export function useRelations(spaceId: string | undefined) {
  const relations = useAppStore((s) => s.relations);
  const setRelations = useAppStore((s) => s.setRelations);
  const addRelation = useAppStore((s) => s.addRelation);
  const updateRelInStore = useAppStore((s) => s.updateRelation);
  const removeRelFromStore = useAppStore((s) => s.removeRelation);

  const {
    status,
    source,
    refetch: fetchRelations,
    retry,
  } = useCachedCollection<Relation[]>({
    spaceId,
    collection: 'relations',
    fetcher: useCallback(() => db.getSpaceRelations(spaceId as string), [spaceId]),
    merge: useCallback((list: Relation[]) => setRelations(list), [setRelations]),
  });

  const createRelation = useCallback(
    async (relation: Omit<Relation, 'id' | 'created_at'>) => {
      const newRel = await db.createRelation(relation);
      addRelation(newRel);
      return newRel;
    },
    [addRelation],
  );

  const updateRelation = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Relation, 'relation_type' | 'relation_detail' | 'gm_only'>>,
    ) => {
      const updated = await db.updateRelation(id, updates);
      updateRelInStore(updated);
      return updated;
    },
    [updateRelInStore],
  );

  const deleteRelation = useCallback(
    async (id: string) => {
      await db.deleteRelation(id);
      removeRelFromStore(id);
    },
    [removeRelFromStore],
  );

  return {
    relations,
    status,
    source,
    retry,
    fetchRelations,
    createRelation,
    updateRelation,
    deleteRelation,
  };
}
