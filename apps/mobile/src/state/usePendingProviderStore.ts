import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A provider id captured from a shared profile link before sign-in resolves.
 *
 * Persisted for the same reason as useInviteStore: sign-in can span an app
 * backgrounding (an OTP wait, a Google account picker), so the id has to
 * survive a cold start, not just the current session.
 */
interface PendingProviderState {
  pendingProviderId: string | null;
  setPendingProviderId: (id: string) => void;
  clearPendingProviderId: () => void;
}

export const usePendingProviderStore = create<PendingProviderState>()(
  persist(
    (set) => ({
      pendingProviderId: null,
      setPendingProviderId: (id) => set({ pendingProviderId: id }),
      clearPendingProviderId: () => set({ pendingProviderId: null }),
    }),
    {
      name: 'sc-pending-provider',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
