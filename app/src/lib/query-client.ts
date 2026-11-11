import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type QueryKey } from '@tanstack/react-query';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One client for the app, shared by the React tree and by code that runs outside it (reminders).
 *
 * - Data is kept for a week and saved on the phone, so the app opens with what it last knew.
 * - Requests always run, online or not; a request that cannot reach the server fails at once and
 *   the saved data stays on screen.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: WEEK_MS,
      networkMode: 'always',
      retry: (failures, error) => {
        const status = (error as { status?: number })?.status;
        // No response: retrying now is pointless. Refusals (4xx) will not change either.
        if (status === undefined || status === 0 || (status >= 400 && status < 500)) return false;
        return failures < 2;
      },
    },
    mutations: { networkMode: 'always' },
  },
});

/** Saves the query cache on the phone (AsyncStorage). */
export const cachePersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'qc.query-cache', throttleTime: 1000 });

/**
 * Which queries are saved. The default keeps only queries whose last fetch succeeded, which would
 * throw the saved data away the first time a refresh fails offline. Keep anything that has data.
 */
export const shouldSaveQuery = (query: { state: { data: unknown } }) => query.state.data !== undefined;

/** Bump when the shape of cached data changes, so an old cache is thrown away instead of misread. */
export const CACHE_VERSION = '1';
export const CACHE_MAX_AGE_MS = WEEK_MS;

/** How fresh cached data must be for code outside React to reuse it instead of refetching. */
export const LOADER_STALE_MS = 15_000;

/**
 * For code outside React: fetch (reusing fresh cached data), and when the server cannot be
 * reached fall back to whatever is cached. Throws only when there is nothing at all.
 */
export async function fetchOrCached<T>(query: { queryKey: QueryKey; queryFn: () => Promise<T> }): Promise<T> {
  try {
    return await queryClient.fetchQuery({ ...query, staleTime: LOADER_STALE_MS });
  } catch (err) {
    const cached = queryClient.getQueryData<T>(query.queryKey);
    if (cached !== undefined) return cached;
    throw err;
  }
}

/** Forget everything cached, in memory and on the phone (on sign-out). */
export async function clearCache() {
  queryClient.clear();
  await cachePersister.removeClient();
}
