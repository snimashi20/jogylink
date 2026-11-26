import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { ConnectivityMonitor } from './types';

/**
 * Connectivity as the phone reports it.
 *
 * `isConnected` alone is not enough on a rural route: a phone attached to a tower with no
 * working data path reports connected quite happily. `isInternetReachable` is the honest signal,
 * so a definite "no" from it counts as offline. While it is still unknown we assume reachable
 * and let a failed upload tell us otherwise — being wrong that way costs one request, while the
 * other way round sales sit on the device when they could have gone.
 */
export function createNetInfoMonitor(): ConnectivityMonitor {
  let connected = true;
  const listeners = new Set<(connected: boolean) => void>();

  const update = (state: NetInfoState): void => {
    const next = isUsable(state);
    if (next === connected) return;
    connected = next;
    listeners.forEach((listener) => listener(next));
  };

  NetInfo.addEventListener(update);
  void NetInfo.fetch().then(update);

  return {
    isConnected: () => connected,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function isUsable(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}
