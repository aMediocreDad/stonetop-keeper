import { useSyncExternalStore } from 'react';
import { isOnline, subscribeConnectivity } from '@/lib/offline/connectivity';

/**
 * React binding over the connectivity signal. `useSyncExternalStore` rather
 * than an effect + state: the value lives outside React and is read during
 * render by `OfflineNotice`, so tearing between the two would show a stale
 * banner for a frame.
 */
export function useConnectivity(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}
