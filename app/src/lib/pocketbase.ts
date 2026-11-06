import * as SecureStore from 'expo-secure-store';
import PocketBase, { AsyncAuthStore } from 'pocketbase';

const AUTH_KEY = 'pb_auth';

// Public configuration, not a secret. Metro inlines EXPO_PUBLIC_* at bundle time, so for a dev
// client the value comes from app/.env on the machine running `npm start`.
export const PB_URL = process.env.EXPO_PUBLIC_POCKETBASE_URL ?? 'https://quick-calories.pb.simonlilja.eu';

const initialAuth = SecureStore.getItemAsync(AUTH_KEY).catch(() => null);

const store = new AsyncAuthStore({
  save: (serialized) => SecureStore.setItemAsync(AUTH_KEY, serialized),
  clear: () => SecureStore.deleteItemAsync(AUTH_KEY),
  initial: initialAuth.then((value) => value ?? ''),
});

export const pb = new PocketBase(PB_URL, store);

// React components re-render a lot; don't let the SDK cancel duplicate in-flight requests.
pb.autoCancellation(false);

/** Resolves once the persisted login (if any) has been loaded into `pb.authStore`. */
export const authReady: Promise<void> = initialAuth.then(() => undefined);
