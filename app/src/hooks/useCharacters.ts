import { useCallback } from 'react';
import { db } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import type { Character } from '@/types';

export function useCharacters(spaceId: string | undefined) {
  // Selectors, not the bare store: this hook is mounted on nearly every page,
  // and a no-selector subscription re-renders its host on ANY store write.
  const characters = useAppStore((s) => s.characters);
  const setCharacters = useAppStore((s) => s.setCharacters);
  const addCharacter = useAppStore((s) => s.addCharacter);
  const updateCharInStore = useAppStore((s) => s.updateCharacter);
  const removeCharFromStore = useAppStore((s) => s.removeCharacter);

  const {
    status,
    source,
    refetch: fetchCharacters,
    retry,
  } = useCachedCollection<Character[]>({
    spaceId,
    collection: 'characters',
    fetcher: useCallback(() => db.getSpaceCharacters(spaceId as string), [spaceId]),
    merge: useCallback((list: Character[]) => setCharacters(list), [setCharacters]),
  });

  const createCharacter = useCallback(
    async (character: Omit<Character, 'id' | 'created_at' | 'updated_at'>) => {
      const newChar = await db.createCharacter(character);
      addCharacter(newChar);
      return newChar;
    },
    [addCharacter],
  );

  const updateCharacter = useCallback(
    async (id: string, updates: Partial<Character>) => {
      const updated = await db.updateCharacter(id, updates);
      updateCharInStore(updated);
      return updated;
    },
    [updateCharInStore],
  );

  const deleteCharacter = useCallback(
    async (id: string) => {
      await db.deleteCharacter(id);
      removeCharFromStore(id);
    },
    [removeCharFromStore],
  );

  return {
    characters,
    status,
    source,
    retry,
    fetchCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
  };
}
