import { create } from 'zustand';

export type TripMode = 'client' | 'provider';

/** Live trip (handoff screen 14) — wired up fully once the map wrapper lands in Phase 2. */
export interface TripState {
  tripMode: TripMode;
  arrived: boolean;
  etaShared: boolean;
  setTripMode: (mode: TripMode) => void;
  setArrived: (arrived: boolean) => void;
  setEtaShared: (etaShared: boolean) => void;
  reset: () => void;
}

const INITIAL = { tripMode: 'client' as TripMode, arrived: false, etaShared: false };

export const useTripStore = create<TripState>((set) => ({
  ...INITIAL,
  setTripMode: (tripMode) => set({ tripMode }),
  setArrived: (arrived) => set({ arrived }),
  setEtaShared: (etaShared) => set({ etaShared }),
  reset: () => set(INITIAL),
}));
