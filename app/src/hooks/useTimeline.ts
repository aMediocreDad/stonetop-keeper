import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { useCachedCollection } from '@/hooks/useCachedCollection';
import { isNetworkError, subscribeConnectivity } from '@/lib/offline/connectivity';
import { normalizeSeason, storedRev } from '@/lib/timeline/seasonEntry';
import { hasSeasonText, latestSeason } from '@/lib/timeline/timelineRange';
import { TimelineConflictError, TimelineOccupiedError, type ConflictEntry } from '@/lib/timeline/timelineConflict';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import type { Season, SeasonEntry, StoredSeason, Timeline, TimelineStrand } from '@/types';

const SAVE_DEBOUNCE_MS = 600;

/** The key of an in-flight entry: strand + year + season. */
const keyOf = (strand: TimelineStrand, year: number, season: Season) =>
  `${strand}:${year}:${season}`;

const parseKey = (k: string) => {
  const [strand, year, season] = k.split(':');
  return { strand: strand as TimelineStrand, year: Number(year), season: season as Season };
};

/**
 * Local text set aside when it could not be persisted before the page was left.
 * Two reasons, two restorations:
 *
 *  - `conflict`: the server refused a stale CAS. We restore the text AND the
 *    conflict banner — a human has to decide.
 *  - `unsaved`: the save failed at the transport layer (offline). There is
 *    nothing to decide: we restore the text, re-mark it `dirty`, and
 *    reconnecting pushes it by itself.
 *
 * `reason` absent = an entry written by an earlier version, which only stored
 * conflicts.
 */
interface StashedEntry {
  strand: TimelineStrand;
  year: number;
  season: Season;
  mine: { title?: string; body: string };
  /** Present only for `conflict`. */
  theirs?: ConflictEntry;
  /** The base revision to reuse for the next save. */
  rev?: number;
  reason?: 'conflict' | 'unsaved';
}

const stashKey = (spaceId: string) => `inkstone:chronicles:conflicts:${spaceId}`;

function readStash(spaceId: string): StashedEntry[] {
  try {
    const raw = sessionStorage.getItem(stashKey(spaceId));
    return raw ? (JSON.parse(raw) as StashedEntry[]) : [];
  } catch {
    return [];
  }
}

function pushStash(spaceId: string, item: StashedEntry): void {
  try {
    // Dedupe by key: a remount that reopens the same conflicted entry must not
    // stack several versions of the same stale "mine".
    const rest = readStash(spaceId).filter(
      (s) => !(s.strand === item.strand && s.year === item.year && s.season === item.season),
    );
    sessionStorage.setItem(stashKey(spaceId), JSON.stringify([...rest, item]));
  } catch {
    // storage unavailable: the leaver's text is lost — an accepted case
  }
}

/** The entry stored for a season, whichever strand it is on. */
function storedEntry(
  tl: Timeline | null,
  strand: TimelineStrand,
  year: number,
  season: Season,
): StoredSeason | undefined {
  const yearKey = String(year);
  return strand === 'gm' ? tl?.gm_entries?.[yearKey]?.[season] : tl?.entries[yearKey]?.[season];
}

function defaultTimeline(spaceId: string): Timeline {
  return {
    id: '',
    space_id: spaceId,
    entries: {},
    current_year: null,
    current_season: null,
    updated_at: '',
  };
}

/**
 * Loads and exposes the current grimoire's "Chronicles" timeline.
 *
 *  - Each edited season is saved ON ITS OWN (a per-entry, debounced RPC), with
 *    a compare-and-swap on its revision: two players on different seasons can
 *    no longer overwrite each other; on the SAME season, the second gets an
 *    explicit conflict instead of a silent overwrite.
 *  - Realtime merges per entry: only entries in flight locally (dirty) keep
 *    their local value, everything else follows the remote.
 *  - The `current_year`/`current_season` marker is derived server-side on every
 *    player write; the local derivation stays for optimism.
 */
export function useTimeline(spaceId: string | undefined) {
  const t = useT();
  const showToast = useAppStore((s) => s.showToast);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Conflicts awaiting human resolution, keyed `strand:year:season`.
  // The ref is the SYNCHRONOUS source (the save gate, read in doSave and
  // scheduleEntrySave); the state is only for rendering — never the other way
  // round, otherwise a timer firing between the conflict being set and the next
  // render would still see the old state (cf. review: Critical races fixed
  // here).
  const [conflicts, setConflicts] = useState<Record<string, ConflictEntry>>({});
  const conflictsRef = useRef(conflicts);
  const setConflict = useCallback((k: string, theirs: ConflictEntry) => {
    conflictsRef.current = { ...conflictsRef.current, [k]: theirs };
    setConflicts(conflictsRef.current);
  }, []);
  const clearConflict = useCallback((k: string) => {
    const next = { ...conflictsRef.current };
    delete next[k];
    conflictsRef.current = next;
    setConflicts(next);
  }, []);

  // A mirror of `timeline` readable from deferred callbacks (debounce/flush);
  // set after render (react-hooks/refs forbids writing a ref during render).
  // The synchronous path (`resolveConflict`, cf. Fix 3) reads `timeline` from
  // the closure rather than this mirror.
  const timelineRef = useRef<Timeline | null>(null);
  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  // A "dirty" entry = edited locally, save not yet landed. The value is the
  // number of the LATEST edit (cf. the earlier editSeq).
  const dirtyRef = useRef<Map<string, number>>(new Map());
  const seqRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const flushersRef = useRef<Map<string, () => Promise<void>>>(new Map());
  // In-flight saves, serialised PER entry: the next waits for the previous so
  // it reads an up-to-date revision (otherwise we would conflict with our own
  // write).
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const mountedRef = useRef(true);
  const restoredRef = useRef(false);

  /**
   * Re-applies text set aside by a previous unmount. Called from the merge (so
   * after an await, never in an effect's synchronous body) and exactly once, so
   * the restoration lands in the same commit as the data it completes.
   */
  const restoreStash = useCallback(
    (space: string) => {
      const stashed = readStash(space);
      if (stashed.length === 0) return;
      try {
        sessionStorage.removeItem(stashKey(space));
      } catch {
        // ignore
      }
      for (const item of stashed) {
        const k = keyOf(item.strand, item.year, item.season);
        // Marking dirty BEFORE setTimeline is load-bearing: a realtime refetch
        // winning the race between the two would otherwise see
        // the entry as clean and overwrite it with the remote value.
        dirtyRef.current.set(k, ++seqRef.current);
        const yearKey = String(item.year);
        const local: SeasonEntry = { ...item.mine, rev: item.theirs?.rev ?? item.rev ?? 0 };
        setTimeline((cur) => {
          if (!cur) return cur;
          if (item.strand === 'player') {
            return {
              ...cur,
              entries: {
                ...cur.entries,
                [yearKey]: { ...(cur.entries[yearKey] || {}), [item.season]: local },
              },
            };
          }
          const gm = { ...(cur.gm_entries || {}) };
          gm[yearKey] = { ...(gm[yearKey] || {}), [item.season]: local };
          return { ...cur, gm_entries: gm };
        });
        // Only a real conflict re-arms the banner. Text that simply was not
        // sent (offline) has nothing to decide: it stays `dirty` and
        // reconnecting pushes it.
        if (item.theirs && item.reason !== 'unsaved') setConflict(k, item.theirs);
      }
    },
    [setConflict],
  );

  // Cache-first read: the timeline paints from the IndexedDB snapshot, then the
  // network replaces it quietly. The merge goes through `mergeRemote` with
  // `dirtyRef` — cache hydration is a THIRD write path into the state, and
  // without that guard it would overwrite an edit in progress exactly as a
  // realtime refetch would.
  const { refetch: fetchTimeline } = useCachedCollection<Timeline | null>({
    spaceId,
    collection: 'timeline',
    fetcher: useCallback(() => db.getTimeline(spaceId as string), [spaceId]),
    merge: useCallback(
      (remote: Timeline | null) => {
        const base = remote ?? defaultTimeline(spaceId ?? '');
        setTimeline((cur) => mergeRemote(cur, base, dirtyRef.current));
        setLoaded(true);
        if (spaceId && !restoredRef.current) {
          restoredRef.current = true;
          restoreStash(spaceId);
        }
      },
      [spaceId, restoreStash],
    ),
  });

  useEffect(() => {
    if (!spaceId) return;
    mountedRef.current = true;
    const timers = timersRef.current;
    const flushers = flushersRef.current;
    // Captured as references, not values: these are Maps whose identity is
    // stable and whose CONTENTS are what the cleanup needs to read.
    const dirty = dirtyRef.current;
    return () => {
      mountedRef.current = false;
      // In-flight edits: debounce cancelled, saved immediately (as before, but
      // per entry).
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      const flushed = new Set(flushers.keys());
      for (const flush of [...flushers.values()]) void flush();
      flushers.clear();
      // Conflicts still OPEN when the page is left: autosave is paused for
      // those entries, so they have no flusher — without setting the text
      // aside it would be lost silently. Same stash/restore mechanism as a
      // rejected flush (deduped by key).
      for (const [k, theirs] of Object.entries(conflictsRef.current)) {
        const { strand, year, season } = parseKey(k);
        const stored = storedEntry(timelineRef.current, strand, year, season);
        if (stored === undefined) continue;
        const { title, body } = normalizeSeason(stored);
        pushStash(spaceId, {
          strand, year, season,
          mine: { title, body },
          theirs,
          reason: 'conflict',
        });
      }
      // Entries still `dirty` with NO flusher and NO conflict: their last save
      // already failed (network), so nothing will push them again. Those that
      // do have a flusher set themselves aside if that flush fails — storing
      // them here too would leave a stale draft behind a successful save.
      for (const k of dirty.keys()) {
        if (flushed.has(k) || conflictsRef.current[k]) continue;
        const { strand, year, season } = parseKey(k);
        const stored = storedEntry(timelineRef.current, strand, year, season);
        if (stored === undefined) continue;
        const { title, body } = normalizeSeason(stored);
        pushStash(spaceId, {
          strand, year, season,
          mine: { title, body },
          rev: storedRev(stored),
          reason: 'unsaved',
        });
      }
    };
  }, [spaceId]);

  /** Sends ONE entry to the server and adopts the revision it returns. */
  const saveEntryNow = useCallback(
    async (
      strand: TimelineStrand,
      year: number,
      season: Season,
      entry: { title?: string; body: string },
      baseRev: number,
      seq: number,
    ) => {
      if (!spaceId) return;
      const k = keyOf(strand, year, season);
      try {
        const saved =
          strand === 'gm'
            ? await db.saveGmTimelineEntry(spaceId, year, season, entry, baseRev)
            : await db.saveTimelineEntry(spaceId, year, season, entry, baseRev);
        const yearKey = String(year);
        const fresh =
          strand === 'gm' ? saved.gm_entries?.[yearKey]?.[season] : saved.entries[yearKey]?.[season];
        const savedRev = storedRev(fresh);
        const noNewerEdit = dirtyRef.current.get(k) === seq;
        setTimeline((cur) => {
          if (!cur) return saved;
          const next: Timeline = { ...cur, id: saved.id, updated_at: saved.updated_at };
          // Server-derived marker: adopted only if there is no more recent
          // keystroke (otherwise the fresher local derivation wins).
          if (strand === 'player' && noNewerEdit) {
            next.current_year = saved.current_year ?? null;
            next.current_season = saved.current_season ?? null;
          }
          // Adopts the server revision onto the local entry WITHOUT losing
          // keystrokes that arrived in flight (local title/body preserved).
          if (strand === 'player') {
            const local = normalizeSeason(next.entries[yearKey]?.[season]);
            next.entries = {
              ...next.entries,
              [yearKey]: { ...(next.entries[yearKey] || {}), [season]: { ...local, rev: savedRev } },
            };
          } else {
            const gm = { ...(next.gm_entries || {}) };
            const local = normalizeSeason(gm[yearKey]?.[season]);
            gm[yearKey] = { ...(gm[yearKey] || {}), [season]: { ...local, rev: savedRev } };
            next.gm_entries = gm;
          }
          return next;
        });
        if (noNewerEdit) dirtyRef.current.delete(k);
      } catch (err) {
        if (err instanceof TimelineConflictError) {
          const theirs = (err as TimelineConflictError).theirs;
          if (mountedRef.current) {
            // dirty stays set: the refetch will not clobber the local text
            // until a human has decided.
            setConflict(k, theirs);
          } else {
            // Rejected during the unmount flush: nothing to display — we set
            // the text aside, restored (with banner) on the next mount.
            pushStash(spaceId, { strand, year, season, mine: entry, theirs, reason: 'conflict' });
          }
          return;
        }
        console.error('[Chroniques] save failed:', err);
        // A network failure is not a failure: the dirty marker holds the text
        // and the reconnect flush pushes it by itself (see below). Telling the
        // user to "try again" for work already queued was wrong on both counts
        // — offline.saveBlocked tells the truth.
        showToast(
          t(
            isNetworkError(err)
              ? 'offline.saveBlocked'
              : strand === 'gm'
                ? 'chronicles.gmSaveError'
                : 'chronicles.saveError',
          ),
        );

        if (isNetworkError(err)) {
          // DO NOT clear the `dirty` marker. It is what stops `mergeRemote`
          // overwriting the local text (cf. the conflict-path comment above):
          // clearing it on a network failure made the entry "clean" when it had
          // never been persisted, and the first successful read — a reconnect,
          // or now cache hydration, which succeeds EVEN offline — replaced the
          // session's account with the server version. A silent loss, at
          // precisely the moment the user expects a sync.
          if (!mountedRef.current) {
            pushStash(spaceId, {
              strand, year, season,
              mine: entry,
              rev: baseRev,
              reason: 'unsaved',
            });
          }
          return;
        }
        // An application error (permissions, validation): the server has
        // decided, there is nothing to push again. Behaviour unchanged.
        if (dirtyRef.current.get(k) === seq) dirtyRef.current.delete(k);
      }
    },
    [spaceId, showToast, t, setConflict],
  );

  /** Schedules an entry's debounced save (captured at fire time, not at keystroke). */
  const scheduleEntrySave = useCallback(
    (strand: TimelineStrand, year: number, season: Season) => {
      if (!spaceId) return;
      const k = keyOf(strand, year, season);
      const seq = ++seqRef.current;
      dirtyRef.current.set(k, seq);
      // An open conflict on this entry: autosave paused — local state keeps
      // accumulating keystrokes, and resolving it restarts the save.
      if (conflictsRef.current[k]) return;
      const existing = timersRef.current.get(k);
      if (existing) clearTimeout(existing);
      const doSave = async () => {
        timersRef.current.delete(k);
        flushersRef.current.delete(k);
        const prev = inflightRef.current.get(k);
        if (prev) await prev; // serialise per entry
        const run = (async () => {
          // A conflict may have been detected while this timer waited (or
          // during the previous in-flight save): autosave is paused, so we do
          // not fire.
          if (conflictsRef.current[k]) return;
          const tl = timelineRef.current;
          if (!tl) return;
          const yearKey = String(year);
          const stored =
            strand === 'gm' ? tl.gm_entries?.[yearKey]?.[season] : tl.entries[yearKey]?.[season];
          const { title, body } = normalizeSeason(stored);
          await saveEntryNow(
            strand, year, season,
            { title, body },
            storedRev(stored),
            dirtyRef.current.get(k) ?? seq,
          );
        })();
        inflightRef.current.set(k, run);
        await run;
        if (inflightRef.current.get(k) === run) inflightRef.current.delete(k);
      };
      flushersRef.current.set(k, doSave);
      timersRef.current.set(k, setTimeout(doSave, SAVE_DEBOUNCE_MS));
    },
    [spaceId, saveEntryNow],
  );

  // Reconnect: entries left `dirty` after a network failure have neither timer
  // nor flusher — nothing would push them without this. We reschedule them
  // as-is; a revision that went stale in the meantime trips the server CAS and
  // so the usual conflict banner. `scheduleEntrySave` skips already-conflicted
  // entries by itself.
  useEffect(() => {
    if (!spaceId) return;
    return subscribeConnectivity((online) => {
      if (!online) return;
      for (const k of [...dirtyRef.current.keys()]) {
        const { strand, year, season } = parseKey(k);
        scheduleEntrySave(strand, year, season);
      }
    });
  }, [spaceId, scheduleEntrySave]);

  // The "current" marker always follows the furthest entry — an optimistic
  // local derivation; the server stays the source of truth on every write.
  const withDerivedCurrent = (cur: Timeline, entries: Timeline['entries']): Timeline => {
    const latest = latestSeason(entries);
    return {
      ...cur,
      entries,
      current_year: latest?.year ?? null,
      current_season: latest?.season ?? null,
    };
  };

  const updateEntry = useCallback(
    (year: number, season: Season, patch: Partial<SeasonEntry>) => {
      const key = String(year);
      setTimeline((cur) => {
        const base = cur ?? defaultTimeline(spaceId ?? '');
        const stored = base.entries[key]?.[season];
        const prev = normalizeSeason(stored);
        // `?? prev`: a patch touching only one field preserves the other;
        // passing `''` does clear it. The local revision travels with the entry.
        const next: SeasonEntry = {
          title: patch.title ?? prev.title,
          body: patch.body ?? prev.body,
          rev: storedRev(stored),
        };
        return withDerivedCurrent(base, {
          ...base.entries,
          [key]: { ...(base.entries[key] || {}), [season]: next },
        });
      });
      scheduleEntrySave('player', year, season);
    },
    [spaceId, scheduleEntrySave],
  );

  /**
   * Moves an entry (re-filing from the editor): optimistic locally, atomic
   * server-side (`move_timeline_entry`, which refuses an occupied target).
   * Returns `true` if moved (or a no-op), `false` if blocked.
   */
  const moveEntry = useCallback(
    (
      from: { year: number; season: Season },
      to: { year: number; season: Season },
    ): boolean => {
      if (from.year === to.year && from.season === to.season) return true;
      const toKey = String(to.year);
      if (hasSeasonText(timeline?.entries[toKey]?.[to.season])) {
        showToast(t('chronicles.moveOccupied'));
        return false;
      }
      if (!spaceId) return false;
      // Locally optimistic (the server re-checks and is authoritative).
      setTimeline((cur) => {
        if (!cur) return cur;
        if (hasSeasonText(cur.entries[toKey]?.[to.season])) return cur;
        const fromKey = String(from.year);
        const moved = normalizeSeason(cur.entries[fromKey]?.[from.season]);
        const entries = { ...cur.entries };
        const srcYear = { ...(entries[fromKey] || {}) };
        delete srcYear[from.season];
        entries[fromKey] = srcYear;
        const dstYear = { ...(entries[toKey] || {}) };
        dstYear[to.season] = moved;
        entries[toKey] = dstYear;
        return withDerivedCurrent(cur, entries);
      });
      // A pending save on the source must go out BEFORE the move, otherwise it
      // would resurrect the entry at the old place. If it has already fired
      // (doSave removes itself from flushersRef before even awaiting the RPC)
      // but is not yet resolved, it is still visible via inflightRef: we wait
      // for it in that case too.
      const srcKey = keyOf('player', from.year, from.season);
      const timer = timersRef.current.get(srcKey);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(srcKey);
      const pendingFlush = flushersRef.current.get(srcKey);
      flushersRef.current.delete(srcKey);
      void (async () => {
        try {
          if (pendingFlush) await pendingFlush();
          else {
            const inflight = inflightRef.current.get(srcKey);
            if (inflight) await inflight;
          }
          const saved = await db.moveTimelineEntry(spaceId, from, to);
          setTimeline((cur) => mergeRemote(cur, saved, dirtyRef.current));
        } catch (err) {
          if (err instanceof TimelineOccupiedError) showToast(t('chronicles.moveOccupied'));
          else {
            console.error('[Chroniques] move failed:', err);
            showToast(t('chronicles.saveError'));
          }
          void fetchTimeline(); // resync the rejected local optimism
        }
      })();
      return true;
    },
    [timeline, spaceId, showToast, t, fetchTimeline],
  );

  /** GM strand: same shape as `updateEntry`, never a derived marker. */
  const updateGmEntry = useCallback(
    (year: number, season: Season, patch: Partial<SeasonEntry>) => {
      const key = String(year);
      setTimeline((cur) => {
        const base = cur ?? defaultTimeline(spaceId ?? '');
        const gmEntries = base.gm_entries ?? {};
        const stored = gmEntries[key]?.[season];
        const prev = normalizeSeason(stored);
        const next: SeasonEntry = {
          title: patch.title ?? prev.title,
          body: patch.body ?? prev.body,
          rev: storedRev(stored),
        };
        return {
          ...base,
          gm_entries: { ...gmEntries, [key]: { ...(gmEntries[key] || {}), [season]: next } },
        };
      });
      scheduleEntrySave('gm', year, season);
    },
    [spaceId, scheduleEntrySave],
  );

  /** The pending conflict on this entry, if there is one. */
  const conflictFor = useCallback(
    (year: number, season: Season, strand: TimelineStrand): ConflictEntry | null =>
      conflicts[keyOf(strand, year, season)] ?? null,
    [conflicts],
  );

  /**
   * Decides a conflict: `theirs` adopts the stored version (the local text is
   * still one Cmd-Z away in the editor); `mine` rewrites the local text over
   * the revision just shown to the user.
   */
  const resolveConflict = useCallback(
    (year: number, season: Season, strand: TimelineStrand, resolution: 'mine' | 'theirs') => {
      const k = keyOf(strand, year, season);
      const theirs = conflictsRef.current[k];
      if (!theirs) return;
      clearConflict(k);
      const yearKey = String(year);
      if (resolution === 'theirs') {
        dirtyRef.current.delete(k);
        setTimeline((cur) => {
          if (!cur) return cur;
          const adopted: SeasonEntry = { title: theirs.title, body: theirs.body, rev: theirs.rev };
          if (strand === 'player') {
            const entries = {
              ...cur.entries,
              [yearKey]: { ...(cur.entries[yearKey] || {}), [season]: adopted },
            };
            return withDerivedCurrent(cur, entries);
          }
          const gm = { ...(cur.gm_entries || {}) };
          gm[yearKey] = { ...(gm[yearKey] || {}), [season]: adopted };
          return { ...cur, gm_entries: gm };
        });
        return;
      }
      // mine: an immediate save based on the revision seen on screen. Read from
      // `timeline` (the closure), NOT `timelineRef`: called synchronously from
      // a handler produced by the render, the closure already carries the
      // freshest committed value; the ref mirror is only set afterwards (cf.
      // Fix 3 of the review) and suits only the timer path (doSave).
      if (!timeline) return;
      const stored =
        strand === 'gm' ? timeline.gm_entries?.[yearKey]?.[season] : timeline.entries[yearKey]?.[season];
      const { title, body } = normalizeSeason(stored);
      const seq = ++seqRef.current;
      dirtyRef.current.set(k, seq);
      void saveEntryNow(strand, year, season, { title, body }, theirs.rev, seq);
    },
    [saveEntryNow, timeline, clearConflict],
  );

  return {
    timeline: timeline ?? defaultTimeline(spaceId ?? ''),
    loaded,
    updateEntry,
    moveEntry,
    updateGmEntry,
    conflictFor,
    resolveConflict,
  };
}

/**
 * Per-entry merge of a remote state: entries in flight locally (dirty keys)
 * keep their local value; everything else — including the marker, unless a
 * player entry is in flight — follows the remote.
 */
export function mergeRemote(
  cur: Timeline | null,
  base: Timeline,
  dirty: Map<string, number>,
): Timeline {
  if (!cur || dirty.size === 0) return base;
  const merged: Timeline = {
    ...base,
    entries: { ...base.entries },
    gm_entries: base.gm_entries ? { ...base.gm_entries } : base.gm_entries,
  };
  let playerDirty = false;
  for (const k of dirty.keys()) {
    const { strand, year, season } = parseKey(k);
    const yearKey = String(year);
    if (strand === 'player') {
      playerDirty = true;
      const local = cur.entries[yearKey]?.[season];
      if (local !== undefined) {
        merged.entries[yearKey] = { ...(merged.entries[yearKey] || {}), [season]: local };
      }
    } else {
      const local = cur.gm_entries?.[yearKey]?.[season];
      if (local !== undefined) {
        const gm = { ...(merged.gm_entries || {}) };
        gm[yearKey] = { ...(gm[yearKey] || {}), [season]: local };
        merged.gm_entries = gm;
      }
    }
  }
  if (playerDirty) {
    merged.current_year = cur.current_year;
    merged.current_season = cur.current_season;
  }
  return merged;
}
