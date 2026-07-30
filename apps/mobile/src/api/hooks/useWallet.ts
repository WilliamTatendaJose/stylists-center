import { useQuery } from '@tanstack/react-query';
import { REFERRAL_ROWS, WALLET } from '../../fixtures/index.js';
import { mockDelay } from '../mockDelay.js';

/** Swaps for `GET /v1/wallet` in Phase 3. */
export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => mockDelay(WALLET),
  });
}

/** Swaps for `GET /v1/wallet/referrals` in Phase 3. */
export function useReferrals() {
  return useQuery({
    queryKey: ['wallet', 'referrals'],
    queryFn: () => mockDelay(REFERRAL_ROWS),
  });
}
