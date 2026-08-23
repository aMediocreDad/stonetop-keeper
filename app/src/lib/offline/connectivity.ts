// =====================================================================
// The online signal.
//
// `navigator.onLine` alone is not usable: it reports `true` on a captive
// portal and on wifi whose uplink is dead — which is the table scenario
// exactly. So it is trusted as a *negative* (false means definitely offline)
// and never as proof of connectivity. The positive signal is empirical: the
// outcome of real requests.
//
// The browser `online` event still matters, but as a TRIGGER rather than a
// verdict. It optimistically flips the state, which wakes the revalidation in
// `useCachedCollection`; if that request fails, `markNetworkFailure` puts us
// straight back offline. Self-correcting, and it avoids the deadlock of a
// purely empirical model — where being offline means making no requests, and
// making no requests means never discovering the network came back.
//
// Imports nothing from `db.ts` or `appStore`: `db.ts` pushes into this module,
// never the reverse. Reversing that closes an import cycle.
// =====================================================================

let _online = true;
const _listeners = new Set<(online: boolean) => void>();
let _wired = false;

function set(next: boolean): void {
  if (_online === next) return; // subscribers fire on transitions only
  _online = next;
  for (const cb of [..._listeners]) cb(next);
}

function wire(): void {
  if (_wired || typeof window === 'undefined') return;
  _wired = true;
  _online = window.navigator?.onLine !== false;
  window.addEventListener('offline', () => set(false));
  window.addEventListener('online', () => set(true));
}

export function isOnline(): boolean {
  wire();
  return _online;
}

/** Fires on transitions only. Returns the unsubscribe. */
export function subscribeConnectivity(cb: (online: boolean) => void): () => void {
  wire();
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

/** A request came back. Definitive proof we are online. */
export function markNetworkSuccess(): void {
  wire();
  set(true);
}

/** A request failed at the transport layer. Definitive proof we are not. */
export function markNetworkFailure(): void {
  wire();
  set(false);
}

/**
 * Realtime channel transitions, pushed from `db.ts`. A closed channel is not
 * conclusive on its own (the server can close one for its own reasons), so it
 * is ignored; only a hard error counts against us, and any successful request
 * overrides it.
 */
export function markRealtimeState(state: 'joined' | 'closed' | 'errored'): void {
  wire();
  if (state === 'joined') set(true);
  else if (state === 'errored') set(false);
}

/**
 * Stable code for "the request never reached the server".
 *
 * Lives here rather than in `db.ts` because `isNetworkError` has to recognise
 * it: the data-layer wrapper re-throws transport failures as `Error(OFFLINE)`,
 * so by the time a hook's catch block runs, the original `TypeError: Failed to
 * fetch` is gone. Without this, every downstream `isNetworkError` check —
 * including the one holding an unsaved chronicle entry — would answer `false`
 * for the exact case it exists to catch.
 */
export const ERR_OFFLINE = 'OFFLINE';

// A transport failure, as opposed to an application error the server chose to
// return. Getting this wrong in the permissive direction is the dangerous
// one — a misclassified WRONG_PASSWORD would flag the app offline and, worse,
// pin a chronicle entry as unsaved forever (see useTimeline's dirty handling).
const NETWORK_MESSAGE =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|net::/i;

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err !== null) {
    const e = err as { name?: unknown; message?: unknown; code?: unknown };
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
    // Our own sentinel, already classified once at the data-layer boundary.
    if (e.message === ERR_OFFLINE) return true;
    // Supabase surfaces a transport failure as a PostgrestError with an EMPTY
    // code and the raw fetch message; a real Postgres error always carries a
    // SQLSTATE-ish code, which is what keeps app errors out of this branch.
    if (typeof e.code === 'string' && e.code !== '') return false;
    if (typeof e.message === 'string' && NETWORK_MESSAGE.test(e.message)) return true;
  }
  return false;
}

/** Tests only — resets module state between cases. */
export function resetConnectivityForTests(): void {
  _online = true;
  _listeners.clear();
  _wired = false;
}
