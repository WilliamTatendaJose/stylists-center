import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * One shared client for the whole app. Short staleTime (not 0) because this
 * market's data is expensive and intermittent (plan §7) — a screen
 * re-focusing shouldn't necessarily re-fetch, but data also shouldn't be
 * cached forever once it's wired to a real, changing backend in Phase 3.
 * `gcTime` must be at least `PERSIST_MAX_AGE_MS` or a persisted entry gets
 * garbage-collected before app restart ever gets a chance to restore it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: PERSIST_MAX_AGE_MS,
      retry: 1,
    },
  },
});

/**
 * Restores the last-known-good server state on cold start before any
 * network round-trip completes — the point of plan §3's "AsyncStorage
 * persistence for server state (needed anyway for intermittent data)",
 * wired up here now that Phase 3 gives every hook something real to cache.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'sc-query-cache',
});

export const PERSIST_OPTIONS: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success',
    // Mutations are never persisted: replaying a queued POST after a cold
    // start risks a duplicate booking/message/etc. — this app doesn't
    // implement offline mutation queueing, only cached reads.
    shouldDehydrateMutation: () => false,
  },
};
