import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Env } from './env';
import { walletRates } from './wallet-rates';

describe('walletRates', () => {
  it('uses the shared defaults when no runtime configuration is available', () => {
    expect(walletRates()).toEqual({ coinUsdCents: 20, referralRewardCoins: 6 });
  });

  it('uses backend-configured coin value and commission amount', () => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'COIN_USD_CENTS' ? 75 : key === 'REFERRAL_REWARD_COINS' ? 10 : undefined,
      ),
    } as unknown as ConfigService<Env, true>;

    expect(walletRates(config)).toEqual({ coinUsdCents: 75, referralRewardCoins: 10 });
  });
});
