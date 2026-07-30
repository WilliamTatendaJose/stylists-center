import { QueryClient } from '@tanstack/react-query';

/**
 * One shared client for the whole app. Short staleTime (not 0) because this
 * market's data is expensive and intermittent (plan §7) — a screen
 * re-focusing shouldn't necessarily re-fetch, but data also shouldn't be
 * cached forever once it's wired to a real, changing backend in Phase 3.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
