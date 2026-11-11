import { QueryClient } from '@tanstack/react-query';

/** One client for the app, shared by the React tree and by code that runs outside it (reminders). */
export const queryClient = new QueryClient();

/** How fresh cached data must be for code outside React to reuse it instead of refetching. */
export const LOADER_STALE_MS = 15_000;
