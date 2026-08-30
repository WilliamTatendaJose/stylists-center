import { create } from 'zustand';
import type { AuthTokens } from '@sc/shared';
import { clearStoredTokens, getStoredTokens, setStoredTokens } from '../auth/tokenStorage.js';
import { queryClient } from '../api/queryClient.js';
import { firebaseAuth } from '../auth/firebaseClient.js';
import { signOut as signOutFirebase } from 'firebase/auth';

export interface AuthState {
  accessToken: string | null;
  /** True once the secure-store read on cold start has resolved — the auth gate must not redirect before this. */
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (tokens: AuthTokens) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  isHydrated: false,
  hydrate: async () => {
    const stored = await getStoredTokens();
    set({ accessToken: stored?.accessToken ?? null, isHydrated: true });
  },
  setSession: async (tokens) => {
    // A Firebase exchange may authenticate a different identity without the
    // previous session passing through our explicit sign-out button. Do not
    // let that identity inherit the old account's cached /me role while the
    // auth gate is deciding which side of the app to open.
    queryClient.clear();
    await setStoredTokens(tokens);
    set({ accessToken: tokens.accessToken });
  },
  signOut: async () => {
    await Promise.all([clearStoredTokens(), signOutFirebase(firebaseAuth).catch(() => undefined)]);
    set({ accessToken: null });
    // Clears the persisted cache too — otherwise a different account signing
    // in on the same device would see the previous user's cached bookings,
    // wallet balance, etc. before their own first fetch resolves.
    queryClient.clear();
  },
}));
