import { create } from 'zustand';
import type { Budget, MatchOfferDto, RadiusKm } from '@sc/shared';

/**
 * Smart-match request flow state (New request -> Searching -> Expired). One
 * store, reset on cancel/expiry-exhaustion rather than on every unmount, so a
 * backgrounded search survives the client navigating away and back — the
 * handoff's footer note on the searching screen is explicit that closing the
 * screen doesn't cancel the request.
 *
 * `secs`/the countdown is deliberately NOT stored here — it derives from a
 * server `expiresAt` (useServerCountdown, added when the matching module
 * lands in Phase 3). Storing a tick count here would make the client clock
 * the authority, which plan §6 rules out explicitly.
 */
export interface RequestState {
  categoryId: string | null;
  budget: Budget;
  radiusKm: RadiusKm;
  attempt: number;
  matchId: string | null;
  expiresAt: string | null;
  offers: MatchOfferDto[];
  setCategory: (categoryId: string) => void;
  setBudget: (budget: Budget) => void;
  setRadiusKm: (radiusKm: RadiusKm) => void;
  startMatch: (matchId: string, expiresAt: string) => void;
  addOffer: (offer: MatchOfferDto) => void;
  retry: (nextRadiusKm: RadiusKm) => void;
  reset: () => void;
}

const INITIAL = {
  categoryId: null,
  budget: { mode: 'flex' } as Budget,
  radiusKm: 3 as RadiusKm,
  attempt: 1,
  matchId: null,
  expiresAt: null,
  offers: [] as MatchOfferDto[],
};

export const useRequestStore = create<RequestState>((set) => ({
  ...INITIAL,
  setCategory: (categoryId) => set({ categoryId }),
  setBudget: (budget) => set({ budget }),
  setRadiusKm: (radiusKm) => set({ radiusKm }),
  startMatch: (matchId, expiresAt) => set({ matchId, expiresAt, offers: [] }),
  addOffer: (offer) => set((s) => ({ offers: [...s.offers, offer] })),
  // Retrying relaxes the budget to flexible per the handoff's expired screen
  // and climbs the radius ladder — the server recomputes and would reject a
  // client that disagrees, so this local update is provisional/optimistic.
  retry: (nextRadiusKm) =>
    set((s) => ({
      attempt: s.attempt + 1,
      radiusKm: nextRadiusKm,
      budget: { mode: 'flex' },
      matchId: null,
      expiresAt: null,
      offers: [],
    })),
  reset: () => set(INITIAL),
}));
