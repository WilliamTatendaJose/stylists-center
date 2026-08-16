import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface InviteState {
  pendingReferralCode: string | null;
  setPendingReferralCode: (code: string) => void;
  clearPendingReferralCode: () => void;
}

export const useInviteStore = create<InviteState>()(
  persist(
    (set) => ({
      pendingReferralCode: null,
      setPendingReferralCode: (code) => set({ pendingReferralCode: code.trim().toUpperCase() }),
      clearPendingReferralCode: () => set({ pendingReferralCode: null }),
    }),
    {
      name: 'sc-invite',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
