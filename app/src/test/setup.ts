import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// The suite runs with `globals: false` (tests import `describe`/`it` from
// vitest explicitly), and React Testing Library only self-registers its
// auto-cleanup when a global `afterEach` exists. Without this file, every
// component and hook rendered in a test stays MOUNTED for the rest of the
// file — effects still subscribed, timers still running.
//
// That was invisible while hooks only talked to per-test fakes. It stops being
// invisible as soon as they share module-level state: leaked instances of
// `useCachedCollection` from finished tests kept reacting to the connectivity
// signal and fought each other into an infinite refetch loop.
afterEach(() => {
  cleanup();
});
