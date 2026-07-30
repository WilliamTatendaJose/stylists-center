import { create } from 'zustand';
import type { Budget, RadiusKm } from '@sc/shared';

/**
 * Smart-match request flow state (New request -> Searching -> Expired). Holds
 * only the draft fields the New-request screen composes (categoryId, budget,
 * radiusKm) plus the identity of the active server-side match — everything
 * about the match's live state (attempt, radiusKm after a retry, budget after
 * it's forced to flex, offers, expiresAt) is server-authoritative and comes
 * from `useMatch(matchId)` (Phase 3 §22), never mirrored here. A retry reuses
 * the same matchId (the server updates the row in place), so this store
 * never needs to invent a new one.
 */
export interface RequestState {
  categoryId: string | null;
  budget: Budget;
  radiusKm: RadiusKm;
  matchId: string | null;
  setCategory: (categoryId: string) => void;
  setBudget: (budget: Budget) => void;
  setRadiusKm: (radiusKm: RadiusKm) => void;
  setMatchId: (matchId: string | null) => void;
  reset: () => void;
}

const INITIAL = {
  categoryId: null,
  budget: { mode: 'flex' } as Budget,
  radiusKm: 3 as RadiusKm,
  matchId: null,
};

export const useRequestStore = create<RequestState>((set) => ({
  ...INITIAL,
  setCategory: (categoryId) => set({ categoryId }),
  setBudget: (budget) => set({ budget }),
  setRadiusKm: (radiusKm) => set({ radiusKm }),
  setMatchId: (matchId) => set({ matchId }),
  reset: () => set(INITIAL),
}));
