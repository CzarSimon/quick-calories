import * as SecureStore from 'expo-secure-store';
import PocketBase, { AsyncAuthStore } from 'pocketbase';
import { Platform } from 'react-native';

import { reportRequest, setPing } from '@/lib/connectivity';

const AUTH_KEY = 'pb_auth';

// Public configuration, not a secret. Metro inlines EXPO_PUBLIC_* at bundle time, so for a dev
// client the value comes from app/.env on the machine running `npm start`.
export const PB_URL = process.env.EXPO_PUBLIC_POCKETBASE_URL ?? 'https://quick-calories.pb.simonlilja.eu';

// The login lives in the iOS keychain. The web build exists only for development and UI tests,
// where SecureStore is unavailable, so it falls back to localStorage there.
const storage =
  Platform.OS === 'web'
    ? {
        get: async () => globalThis.localStorage?.getItem(AUTH_KEY) ?? null,
        set: async (value: string) => globalThis.localStorage?.setItem(AUTH_KEY, value),
        remove: async () => globalThis.localStorage?.removeItem(AUTH_KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(AUTH_KEY),
        set: (value: string) => SecureStore.setItemAsync(AUTH_KEY, value),
        remove: () => SecureStore.deleteItemAsync(AUTH_KEY),
      };

const initialAuth = storage.get().catch(() => null);

const store = new AsyncAuthStore({
  save: (serialized) => storage.set(serialized),
  clear: () => storage.remove(),
  initial: initialAuth.then((value) => value ?? ''),
});

export const pb = new PocketBase(PB_URL, store);

// React components re-render a lot; don't let the SDK cancel duplicate in-flight requests.
pb.autoCancellation(false);

// The hosted server rate-limits requests (HTTP 429). Wait briefly and retry instead of failing a save.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const send = pb.send.bind(pb);
pb.send = async <T = unknown>(path: string, options: Parameters<typeof send>[1]): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await send<T>(path, options);
      reportRequest('response');
      return result;
    } catch (err) {
      const status = (err as { status?: number }).status;
      // Status 0 means no response at all: offline, or the server is unreachable.
      reportRequest(status === 0 || status === undefined ? 'no-response' : 'response');
      const delay = RETRY_DELAYS_MS[attempt];
      if (status !== 429 || delay === undefined) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
setPing(() => pb.health.check());

/** Resolves once the persisted login (if any) has been loaded into `pb.authStore`. */
export const authReady: Promise<void> = initialAuth.then(() => undefined);

/** The signed-in user's id. Throws when called while signed out. */
export function currentUserId(): string {
  const id = pb.authStore.record?.id;
  if (!id) throw new Error('Not signed in');
  return id;
}
