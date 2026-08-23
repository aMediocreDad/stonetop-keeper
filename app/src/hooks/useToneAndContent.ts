import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import { isNetworkError, subscribeConnectivity } from '@/lib/offline/connectivity';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import type { ToneAndContent } from '@/types';

const SAVE_DEBOUNCE_MS = 600;

function defaultRecord(spaceId: string): ToneAndContent {
  return { id: '', space_id: spaceId, notes: '', updated_at: '' };
}

/**
 * The table's shared tone & content page — `useGmJournal` with a single field.
 *
 * Multi-writer, unlike the journal: within `notes`, last write wins. That is
 * only tolerable because `useCachedCollection` owns a realtime subscription
 * that keeps every open copy fresh; without it a second reader would save over
 * an edit they never saw.
 */
export function useToneAndContent(spaceId: string | undefined) {
  const t = useT();
  const showToast = useAppStore((s) => s.showToast);
  const [record, setRecord] = useState<ToneAndContent | null>(null);
  const [loaded, setLoaded] = useState(false);

  const recordRef = useRef<ToneAndContent | null>(null);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  // Sequence number of the last local edit — same discipline as useGmJournal,
  // narrowed from a Map<Field, number> to one field.
  const dirtyRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves serialized: the next one waits for the previous one.
  const inflightRef = useRef<Promise<void>>(Promise.resolve());

  // Dirtiness sampled at the START of a network round trip, unioned with
  // dirtiness at merge time. "before" covers a save completing while this
  // fetch is still in flight; "after" covers an edit that starts DURING the
  // GET. Either alone lets a hydration clobber a live edit.
  const dirtyBeforeRef = useRef(false);

  useCachedCollection<ToneAndContent | null>({
    spaceId,
    collection: 'toneAndContent',
    fetcher: useCallback(() => {
      dirtyBeforeRef.current = dirtyRef.current !== null;
      return db.getToneAndContent(spaceId as string);
    }, [spaceId]),
    merge: useCallback(
      (remote: ToneAndContent | null, source: 'cache' | 'network') => {
        const next = remote ?? defaultRecord(spaceId ?? '');
        // A cache read has no round trip to straddle, so there is no "before".
        const dirty =
          source === 'network'
            ? dirtyBeforeRef.current || dirtyRef.current !== null
            : dirtyRef.current !== null;
        setRecord((cur) => {
          if (!cur || !dirty) return next;
          // An edit is in flight: keep the local text, take the rest.
          return { ...next, notes: cur.notes };
        });
        setLoaded(true);
      },
      [spaceId],
    ),
  });

  const save = useCallback(
    (seq: number) => {
      if (!spaceId) return;
      inflightRef.current = inflightRef.current.then(async () => {
        const cur = recordRef.current;
        if (!cur) return;
        try {
          const saved = await db.saveToneAndContent(spaceId, { notes: cur.notes });
          if (!saved) return;
          if (dirtyRef.current === seq) dirtyRef.current = null;
          setRecord((c) =>
            c ? { ...c, id: saved.id, updated_at: saved.updated_at } : saved,
          );
        } catch (err) {
          console.error('[tone & content] save failed:', err);
          showToast(
            t(isNetworkError(err) ? 'offline.saveBlocked' : 'toneAndContent.saveError'),
          );
          // Do NOT clear the dirty marker: the text was never persisted, so it
          // must stay pinned to the local value until a later save succeeds.
          // Safety property, not something to "fix" with retry logic.
        }
      });
    },
    [spaceId, showToast, t],
  );

  // Held in a ref so the unmount and reconnect effects can fire a save without
  // taking `save` as a dependency (its identity changes with `spaceId`, which
  // would re-run — and therefore re-arm — those effects).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Leaving the page inside the debounce window must not drop the text:
  // flush instead of just clearing the timer.
  useEffect(() => {
    if (!spaceId) return;
    return () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const seq = dirtyRef.current;
      if (seq !== null) saveRef.current(seq);
    };
  }, [spaceId]);

  // Reconnect: text left dirty by a failed save has no timer to retry it.
  useEffect(() => {
    if (!spaceId) return;
    return subscribeConnectivity((online) => {
      if (!online) return;
      const seq = dirtyRef.current;
      if (seq !== null) saveRef.current(seq);
    });
  }, [spaceId]);

  const updateNotes = useCallback(
    (html: string) => {
      const seq = ++seqRef.current;
      dirtyRef.current = seq;
      // The ref is the synchronous source of truth: two edits in one tick must
      // not read a stale snapshot.
      const next = { ...(recordRef.current ?? defaultRecord(spaceId ?? '')), notes: html };
      recordRef.current = next;
      setRecord(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        save(dirtyRef.current ?? seq);
      }, SAVE_DEBOUNCE_MS);
    },
    [spaceId, save],
  );

  return { record: record ?? defaultRecord(spaceId ?? ''), loaded, updateNotes };
}
