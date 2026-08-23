import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import { isNetworkError, subscribeConnectivity } from '@/lib/offline/connectivity';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import type { GmJournal, Wonder } from '@/types';

const SAVE_DEBOUNCE_MS = 600;

type Field = 'notes' | 'wonders';

function defaultJournal(spaceId: string): GmJournal {
  return { id: '', space_id: spaceId, notes: '', wonders: [], updated_at: '' };
}

/**
 * GM journal: notes are debounced, wonders are saved immediately (discrete
 * actions). Two independent dirty fields — the RPC only receives the field
 * that changed (server-side merge by key presence), so there's no cross-field
 * clobbering between devices; within a single field, last write wins
 * (single-GM content, assumed).
 */
export function useGmJournal(spaceId: string | undefined) {
  const t = useT();
  const showToast = useAppStore((s) => s.showToast);
  const [journal, setJournal] = useState<GmJournal | null>(null);
  const [loaded, setLoaded] = useState(false);

  const journalRef = useRef<GmJournal | null>(null);
  useEffect(() => {
    journalRef.current = journal;
  }, [journal]);

  // Field -> sequence number of the last local edit (same discipline as useTimeline).
  const dirtyRef = useRef<Map<Field, number>>(new Map());
  const seqRef = useRef(0);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves serialized per field: the next one waits for the previous one.
  const inflightRef = useRef<Map<Field, Promise<void>>>(new Map());

  // Dirtiness sampled at the START of a network round trip. It has to be
  // unioned with the dirtiness at merge time:
  //  - "before" covers a save's own completion racing this fetch's merge (the
  //    save can clear the flag while this fetch is still in flight — it must
  //    still count as "locally in flight when this ping arrived").
  //  - "after" covers the opposite race: an edit that starts DURING the GET
  //    (clean when the ping arrived, dirty by the time it lands).
  // The union is computed before the `size === 0` fast path, or a fully-clean
  // "before" snapshot would short-circuit past a mid-flight edit.
  const dirtyBeforeRef = useRef<Set<Field>>(new Set());

  // Cache-first, same contract as every other collection. The dirty-union
  // merge is what keeps hydration from clobbering an in-flight edit — it
  // already guarded realtime refetches, and a snapshot landing while offline
  // is the same class of event.
  useCachedCollection<GmJournal | null>({
    spaceId,
    collection: 'gmJournal',
    fetcher: useCallback(() => {
      dirtyBeforeRef.current = new Set(dirtyRef.current.keys());
      return db.getGmJournal(spaceId as string);
    }, [spaceId]),
    merge: useCallback(
      (remote: GmJournal | null, source: 'cache' | 'network') => {
        const next = remote ?? defaultJournal(spaceId ?? '');
        // A cache read has no round trip to straddle, so there is no "before".
        const dirtyUnion =
          source === 'network'
            ? new Set([...dirtyBeforeRef.current, ...dirtyRef.current.keys()])
            : new Set(dirtyRef.current.keys());
        setJournal((cur) => {
          if (!cur || dirtyUnion.size === 0) return next;
          // Fields in flight keep their local value; the rest follows remote.
          return {
            ...next,
            notes: dirtyUnion.has('notes') ? cur.notes : next.notes,
            wonders: dirtyUnion.has('wonders') ? cur.wonders : next.wonders,
          };
        });
        setLoaded(true);
      },
      [spaceId],
    ),
  });

  const saveField = useCallback(
    (field: Field, seq: number) => {
      if (!spaceId) return;
      const prev = inflightRef.current.get(field) ?? Promise.resolve();
      const run = prev.then(async () => {
        const cur = journalRef.current;
        if (!cur) return;
        const patch = field === 'notes' ? { notes: cur.notes } : { wonders: cur.wonders };
        try {
          const saved = await db.saveGmJournal(spaceId, patch);
          if (!saved) return;
          if (dirtyRef.current.get(field) === seq) dirtyRef.current.delete(field);
          setJournal((c) => (c ? { ...c, id: saved.id, updated_at: saved.updated_at } : saved));
        } catch (err) {
          console.error('[GM journal] save failed:', err);
          // Network failure ≠ failure: the dirty marker holds the text and
          // the reconnect flush below re-sends it — saveBlocked tells the
          // truth instead of asking for a retry the app already owns.
          showToast(t(isNetworkError(err) ? 'offline.saveBlocked' : 'gmJournal.saveError'));
          // Do NOT clear the dirty marker here: the field was never
          // persisted, so it must stay pinned to the local value until a
          // later save actually succeeds (either a retry via the next edit,
          // or none — but never silently adopted from remote in the
          // meantime). Safety property, not something to "fix" with retry
          // logic.
        }
      });
      inflightRef.current.set(field, run);
    },
    [spaceId, showToast, t],
  );

  // Held in a ref so the unmount and reconnect effects can fire a save without
  // taking `saveField` as a dependency (it changes identity with `spaceId`,
  // which would re-run — and therefore re-arm — those effects).
  const saveFieldRef = useRef(saveField);
  useEffect(() => {
    saveFieldRef.current = saveField;
  });

  // Leaving the page inside the debounce window used to drop the note
  // outright: the cleanup cleared the timer and nothing replaced it. Flush
  // instead, exactly like `useTimeline` does.
  useEffect(() => {
    if (!spaceId) return;
    // Captured as a reference, not a value: the Map's identity is stable and
    // its CONTENTS at cleanup time are what matters.
    const dirty = dirtyRef.current;
    return () => {
      if (!notesTimerRef.current) return;
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
      const seq = dirty.get('notes');
      if (seq !== undefined) saveFieldRef.current('notes', seq);
    };
  }, [spaceId]);

  // Reconnect: a field left dirty by a failed save has no timer to retry it.
  useEffect(() => {
    if (!spaceId) return;
    return subscribeConnectivity((online) => {
      if (!online) return;
      for (const [field, seq] of [...dirtyRef.current.entries()]) {
        saveFieldRef.current(field, seq);
      }
    });
  }, [spaceId]);

  const updateNotes = useCallback(
    (html: string) => {
      const seq = ++seqRef.current;
      dirtyRef.current.set('notes', seq);
      // Ref is the synchronous source of truth (like saveWonders below): two
      // edits landing in the same tick (e.g. a keystroke followed by adding a
      // wonder before React re-renders) must not read/write a stale snapshot
      // of the OTHER field and clobber it.
      const next = { ...(journalRef.current ?? defaultJournal(spaceId ?? '')), notes: html };
      journalRef.current = next;
      setJournal(next);
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
      notesTimerRef.current = setTimeout(() => {
        notesTimerRef.current = null;
        saveField('notes', dirtyRef.current.get('notes') ?? seq);
      }, SAVE_DEBOUNCE_MS);
    },
    [spaceId, saveField],
  );

  /** Sets the new list and saves it right away (discrete action). */
  const saveWonders = useCallback(
    (mutate: (wonders: Wonder[]) => Wonder[]) => {
      const seq = ++seqRef.current;
      dirtyRef.current.set('wonders', seq);
      const base = journalRef.current ?? defaultJournal(spaceId ?? '');
      const nextWonders = mutate(base.wonders);
      setJournal({ ...base, wonders: nextWonders });
      journalRef.current = { ...base, wonders: nextWonders };
      saveField('wonders', seq);
    },
    [spaceId, saveField],
  );

  const addWonder = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      saveWonders((ws) => [
        ...ws,
        {
          id: crypto.randomUUID(),
          text: trimmed,
          resolved: false,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [saveWonders],
  );

  const toggleWonder = useCallback(
    (id: string) =>
      saveWonders((ws) => ws.map((w) => (w.id === id ? { ...w, resolved: !w.resolved } : w))),
    [saveWonders],
  );

  const setResolution = useCallback(
    (id: string, resolution: string) =>
      saveWonders((ws) =>
        ws.map((w) => (w.id === id ? { ...w, resolution: resolution.trim() || undefined } : w)),
      ),
    [saveWonders],
  );

  const deleteWonder = useCallback(
    (id: string) => saveWonders((ws) => ws.filter((w) => w.id !== id)),
    [saveWonders],
  );

  return {
    journal: journal ?? defaultJournal(spaceId ?? ''),
    loaded,
    updateNotes,
    addWonder,
    toggleWonder,
    setResolution,
    deleteWonder,
  };
}
