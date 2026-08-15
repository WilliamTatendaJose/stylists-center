import { create } from 'zustand';
import type { AdminIdentity } from '@sc/shared';

interface AuthState {
  /** In-memory only, never persisted — a page refresh re-derives it from the httpOnly refresh cookie (see bootstrapSession). */
  accessToken: string | null;
  admin: AdminIdentity | null;
  /** True until the initial refresh-cookie check on app load resolves — the app must not render "logged out" before it knows. */
  isBootstrapping: boolean;
  setSession: (accessToken: string, admin: AdminIdentity) => void;
  setAccessToken: (accessToken: string) => void;
  finishBootstrapping: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  admin: null,
  isBootstrapping: true,
  setSession: (accessToken, admin) => {
    set({ accessToken, admin, isBootstrapping: false });
  },
  setAccessToken: (accessToken) => {
    set({ accessToken });
  },
  finishBootstrapping: () => {
    set({ isBootstrapping: false });
  },
  clear: () => {
    set({ accessToken: null, admin: null, isBootstrapping: false });
  },
}));
