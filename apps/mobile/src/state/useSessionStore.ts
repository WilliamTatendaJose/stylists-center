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
  setActiveRole: (role: ActiveRole) => void;
  setLocation: (location: LatLng) => void;
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
      setActiveRole: (activeRole) => set({ activeRole }),
      setLocation: (location) => set({ location }),
    }),
    {
      name: 'sc-session',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
