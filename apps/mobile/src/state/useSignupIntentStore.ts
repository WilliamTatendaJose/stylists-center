import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SignupIntentState {
  /** Set on the sign-up screen's account-type picker; null once acted on or never chosen (e.g. sign-in). */
  pendingAccountType: 'client' | 'provider' | null;
  setPendingAccountType: (type: 'client' | 'provider') => void;
  clearPendingAccountType: () => void;
}

/**
 * Persisted for the same reason as useInviteStore's pendingReferralCode: the
 * choice is made before the account is even verified, and email verification
 * can span an app close (the user leaves to tap a link in their mail app),
 * so it has to survive a cold start, not just the current session.
 *
 * useAuthGate reads this once profileComplete is true and forces a stop at
 * /provider-setup when it's 'provider' and the account has no provider
 * profile yet — the same "deliver once" pattern as usePendingProviderStore.
 */
export const useSignupIntentStore = create<SignupIntentState>()(
  persist(
    (set) => ({
      pendingAccountType: null,
      setPendingAccountType: (pendingAccountType) => set({ pendingAccountType }),
      clearPendingAccountType: () => set({ pendingAccountType: null }),
    }),
    {
      name: 'sc-signup-intent',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
