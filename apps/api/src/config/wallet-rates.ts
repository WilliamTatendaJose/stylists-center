import type { ConfigService } from '@nestjs/config';
import { COIN_USD_CENTS, REFERRAL_REWARD_COINS } from '@sc/shared';
import type { Env } from './env';

/** Runtime wallet rates. Environment values let operations change policy without rebuilding the app. */
export function walletRates(config?: ConfigService<Env, true>) {
  return {
    coinUsdCents: config?.get('COIN_USD_CENTS', { infer: true }) ?? COIN_USD_CENTS,
    referralRewardCoins:
      config?.get('REFERRAL_REWARD_COINS', { infer: true }) ?? REFERRAL_REWARD_COINS,
  };
}
