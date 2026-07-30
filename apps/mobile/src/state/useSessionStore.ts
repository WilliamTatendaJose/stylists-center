import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActiveRole } from '@sc/shared';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SessionState {
  activeRole: ActiveRole;
  hasProviderProfile: boolean;
  /** Client's last known position — Avondale by default, matching the handoff's seed. */
  location: LatLng;
  /** Gates the one-time offline map-tile download (plan §5/§9 item 18) — stands in for "first login" until auth exists. */
  hasDownloadedOfflinePack: boolean;
  setActiveRole: (role: ActiveRole) => void;
  setLocation: (location: LatLng) => void;
  setHasDownloadedOfflinePack: (value: boolean) => void;
}

const AVONDALE: LatLng = { lat: -17.7955, lng: 31.033 };

/**
 * Persisted (survives app restart) — the role toggle and last-known location
 * are the two things about a session worth remembering across cold starts;
 * everything else session-shaped resets to a fresh flow.
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeRole: 'client',
      hasProviderProfile: false,
      location: AVONDALE,
      hasDownloadedOfflinePack: false,
      setActiveRole: (activeRole) => set({ activeRole }),
      setLocation: (location) => set({ location }),
      setHasDownloadedOfflinePack: (hasDownloadedOfflinePack) => set({ hasDownloadedOfflinePack }),
    }),
    {
      name: 'sc-session',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
