import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isOnline,
  subscribeConnectivity,
  markNetworkSuccess,
  markNetworkFailure,
  markRealtimeState,
  isNetworkError,
  resetConnectivityForTests,
} from '@/lib/offline/connectivity';

beforeEach(() => {
  resetConnectivityForTests();
});

describe('connectivity — state', () => {
  it('starts online', () => {
    expect(isOnline()).toBe(true);
  });

  it('markNetworkFailure flips offline and notifies subscribers', () => {
    const seen: boolean[] = [];
    subscribeConnectivity((online) => seen.push(online));

    markNetworkFailure();

    expect(isOnline()).toBe(false);
    expect(seen).toEqual([false]);
  });

  it('markNetworkSuccess flips back online', () => {
    markNetworkFailure();
    const seen: boolean[] = [];
    subscribeConnectivity((online) => seen.push(online));

    markNetworkSuccess();

    expect(isOnline()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('notifies on transitions only, not on every mark', () => {
    const seen: boolean[] = [];
    subscribeConnectivity((online) => seen.push(online));

    markNetworkSuccess(); // already online — no transition
    markNetworkFailure();
    markNetworkFailure(); // already offline — no transition
    markNetworkSuccess();

    expect(seen).toEqual([false, true]);
  });

  it('stops delivering after unsubscribe', () => {
    const seen: boolean[] = [];
    const unsub = subscribeConnectivity((online) => seen.push(online));

    markNetworkFailure();
    unsub();
    markNetworkSuccess();

    expect(seen).toEqual([false]);
  });

  it('a browser offline event forces offline', () => {
    isOnline(); // wire the listeners
    window.dispatchEvent(new Event('offline'));
    expect(isOnline()).toBe(false);
  });

  // Optimistic on purpose: the event wakes revalidation, and a failing
  // revalidation calls markNetworkFailure right back. Treating it as
  // non-conclusive instead would deadlock — offline means no requests, and no
  // requests means never learning the network returned.
  it('a browser online event optimistically flips online so revalidation can run', () => {
    isOnline();
    window.dispatchEvent(new Event('offline'));
    expect(isOnline()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(isOnline()).toBe(true);
  });

  it('an errored realtime channel flips offline; a joined one flips back', () => {
    markRealtimeState('errored');
    expect(isOnline()).toBe(false);

    markRealtimeState('joined');
    expect(isOnline()).toBe(true);
  });

  it('a closed realtime channel is not conclusive on its own', () => {
    markRealtimeState('closed');
    expect(isOnline()).toBe(true);
  });
});

describe('connectivity — isNetworkError', () => {
  it.each([
    ['a fetch TypeError', new TypeError('Failed to fetch')],
    ['Safari wording', new TypeError('Load failed')],
    ['Firefox wording', new TypeError('NetworkError when attempting to fetch resource.')],
    ['an abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ['a Supabase transport error (empty code)', { code: '', message: 'TypeError: Failed to fetch', details: null, hint: null }],
  ])('recognises %s', (_label, err) => {
    expect(isNetworkError(err)).toBe(true);
  });

  // The dangerous direction. A misclassified app error would flag the app
  // offline and pin a chronicle entry as permanently unsaved.
  it.each([
    ['a wrong password', new Error('WRONG_PASSWORD')],
    ['a forbidden', new Error('FORBIDDEN')],
    ['an invalid token', { code: '28000', message: 'INVALID_TOKEN', details: null, hint: null }],
    ['a Postgres constraint violation', { code: '23505', message: 'duplicate key value', details: null, hint: null }],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, err) => {
    expect(isNetworkError(err)).toBe(false);
  });

  // A coded error is an application error even when its text mentions the
  // network — the code is the discriminator, not the prose.
  it('rejects a coded error whose message happens to mention fetching', () => {
    expect(isNetworkError({ code: 'P0001', message: 'failed to fetch the steading row' })).toBe(false);
  });
});

describe('connectivity — no leakage between tests', () => {
  it('resets cleanly', () => {
    const cb = vi.fn();
    subscribeConnectivity(cb);
    resetConnectivityForTests();
    markNetworkFailure();
    expect(cb).not.toHaveBeenCalled();
  });
});
