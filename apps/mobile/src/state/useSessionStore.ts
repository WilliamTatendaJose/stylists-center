import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clampBrowseRadiusKm, DEFAULT_BROWSE_RADIUS_KM, type ActiveRole } from '@sc/shared';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Where `location` came from. This is not bookkeeping — every distance,
 * category count and "available now" row on the Find tab is computed from
 * `location`, so the UI must be able to tell the user whether those numbers
 * are about where they actually are or about a city-centre guess. Showing
 * "located" over a fallback coordinate is the specific lie this replaces.
 */
export type LocationSource =
  /** No fix yet — permission not resolved, or the first read is still in flight. */
  | 'pending'
  /** A real GPS/network fix from the device. */
  | 'device'
  /** Permission refused; `location` is the city-centre fallback. */
  | 'denied'
  /** Permission granted but no fix available (location services off, hardware error). */
  | 'unavailable';

export interface SessionState {
  activeRole: ActiveRole;
  hasProviderProfile: boolean;
  /** Last known position. Only meaningful as the user's own position when `locationSource === 'device'`. */
  location: LatLng;
  locationSource: LocationSource;
  /** Human place name for `location`, reverse-geocoded from the real fix. Null until resolved. */
  areaLabel: string | null;
  /**
   * How far the user is willing to travel. Applied to the category counts,
   * the "available now" list, provider search, and the map alike, so the
   * whole app describes one consistent area rather than several different
   * ones. A free-ranging preference (1-50 km via a slider) — deliberately
   * separate from the smart-match request's own starting radius
   * (useRequestStore), which is its own draft that only ever applies to one
   * posted request, not a standing browse preference.
   */
  maxDistanceKm: number;
  /** Gates the one-time offline map-tile download (plan §5/§9 item 18) — stands in for "first login" until auth exists. */
  hasDownloadedOfflinePack: boolean;
  setActiveRole: (role: ActiveRole) => void;
  setLocation: (location: LatLng, source: LocationSource) => void;
  setLocationSource: (source: LocationSource) => void;
  setAreaLabel: (areaLabel: string | null) => void;
  setMaxDistanceKm: (maxDistanceKm: number) => void;
  setHasDownloadedOfflinePack: (value: boolean) => void;
}

/**
 * Harare city centre. A starting point so the first render has something to
 * query with, never a claim about the user — `locationSource` stays
 * 'pending'/'denied' until a real fix replaces it.
 */
const HARARE_CENTRE: LatLng = { lat: -17.8252, lng: 31.0335 };

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
      location: HARARE_CENTRE,
      locationSource: 'pending',
      areaLabel: null,
      // 10 km by default. In a marketplace this sparse a tight default shows
      // an empty screen to most real positions, and an empty first
      // impression is worse than a slightly longer trip — but the user can
      // now widen or narrow it freely instead of being stuck on one of three
      // fixed rungs.
      maxDistanceKm: DEFAULT_BROWSE_RADIUS_KM,
      hasDownloadedOfflinePack: false,
      setActiveRole: (activeRole) => set({ activeRole }),
      setLocation: (location, locationSource) => set({ location, locationSource }),
      setLocationSource: (locationSource) => set({ locationSource }),
      setAreaLabel: (areaLabel) => set({ areaLabel }),
      setMaxDistanceKm: (maxDistanceKm) =>
        set({ maxDistanceKm: clampBrowseRadiusKm(maxDistanceKm) }),
      setHasDownloadedOfflinePack: (hasDownloadedOfflinePack) => set({ hasDownloadedOfflinePack }),
    }),
    {
      name: 'sc-session',
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * `locationSource` is deliberately NOT persisted. A coordinate cached
       * from last week is a reasonable starting guess, but "the device is
       * located right now" is a claim that expires the moment the app closes
       * — rehydrating it would let a stale fix present itself as live.
       */
      partialize: (state) => ({
        activeRole: state.activeRole,
        hasProviderProfile: state.hasProviderProfile,
        location: state.location,
        areaLabel: state.areaLabel,
        maxDistanceKm: state.maxDistanceKm,
        hasDownloadedOfflinePack: state.hasDownloadedOfflinePack,
      }),
    },
  ),
);
