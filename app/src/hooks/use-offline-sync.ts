import { useEffect } from 'react';
import { AppState } from 'react-native';

import { checkConnection, onBackOnline } from '@/lib/connectivity';
import { flushOutbox } from '@/lib/outbox';
import { queryClient } from '@/lib/query-client';

/**
 * Sends changes saved on the phone and refreshes the data: when the app starts, when it returns
 * to the foreground, and when the server becomes reachable again.
 */
export function useOfflineSync(signedIn: boolean | null) {
  useEffect(() => {
    if (!signedIn) return;

    void flushOutbox();
    const stop = onBackOnline(() => void flushOutbox().then(() => queryClient.invalidateQueries()));
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void checkConnection().then((online) => {
        if (online) void flushOutbox();
      });
    });
    return () => {
      stop();
      appState.remove();
    };
  }, [signedIn]);
}
