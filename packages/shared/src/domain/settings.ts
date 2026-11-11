/**
 * Every business value StylistsCenter may want to change without a release:
 * prices, rewards, limits and support contacts.
 *
 * Each value resolves in this order:
 *   1. a value saved by staff in the admin console (Settings page);
 *   2. otherwise the environment variable named in `env`;
 *   3. otherwise `default` below.
 *
 * Resetting a value in the console removes the saved value, so the
 * environment variable (or the default) applies again.
 *
 * Technical safety limits (page sizes, upload sizes, search radius bounds)
 * are deliberately not here: they protect the server and are not policy.
 */
import { BUDGET_MAX_USD, BUDGET_MIN_USD, BUDGET_STEP_USD } from './budget.js';
import { CASH_OUT_MIN_USD_CENTS, COIN_USD_CENTS, REFERRAL_REWARD_COINS } from './money.js';
import { DEFAULT_SUBSCRIPTION_PRICE_USD_CENTS, SUBSCRIPTION_CYCLE_DAYS } from './subscription.js';

/** How a value is entered and displayed. Money is always integer USD cents. */
export type SettingKind = 'cents' | 'coins' | 'days' | 'usd' | 'text';

interface SettingBase {
  label: string;
  help: string;
  group: string;
  env: string;
  /** Sent to the apps in `GET /v1/config`. Everything here is safe to publish. */
  public: boolean;
}

export interface NumberSettingDefinition extends SettingBase {
  kind: Exclude<SettingKind, 'text'>;
  default: number;
  min: number;
  max: number;
}

export interface TextSettingDefinition extends SettingBase {
  kind: 'text';
  default: string;
  maxLength: number;
}

export type SettingDefinition = NumberSettingDefinition | TextSettingDefinition;

export const SETTING_DEFINITIONS = {
  coinUsdCents: {
    kind: 'cents',
    label: 'Value of one SC coin',
    help: 'What one coin is worth when cashed out or spent, in US cents.',
    group: 'Wallet and rewards',
    env: 'COIN_USD_CENTS',
    public: true,
    default: COIN_USD_CENTS,
    min: 1,
    max: 10_000,
  },
  referralRewardCoins: {
    kind: 'coins',
    label: 'Referral reward',
    help: 'Coins credited to an agent when someone they referred completes their first booking.',
    group: 'Wallet and rewards',
    env: 'REFERRAL_REWARD_COINS',
    public: true,
    default: REFERRAL_REWARD_COINS,
    min: 0,
    max: 100_000,
  },
  cashOutMinUsdCents: {
    kind: 'cents',
    label: 'Cash-out minimum',
    help: 'A wallet balance must be above this amount before it can be cashed out.',
    group: 'Wallet and rewards',
    env: 'CASH_OUT_MIN_USD_CENTS',
    public: true,
    default: CASH_OUT_MIN_USD_CENTS,
    min: 0,
    max: 10_000_000,
  },
  subscriptionPriceUsdCents: {
    kind: 'cents',
    label: 'Subscription price for new accounts',
    help: 'Monthly subscription given to newly created stylist accounts. Existing accounts keep their own price, which can be changed per account on the Providers page.',
    group: 'Subscriptions',
    env: 'SUBSCRIPTION_PRICE_USD_CENTS',
    public: true,
    default: DEFAULT_SUBSCRIPTION_PRICE_USD_CENTS,
    min: 0,
    max: 10_000_000,
  },
  subscriptionCycleDays: {
    kind: 'days',
    label: 'Subscription length',
    help: 'Days of cover that one subscription payment buys.',
    group: 'Subscriptions',
    env: 'SUBSCRIPTION_CYCLE_DAYS',
    public: true,
    default: SUBSCRIPTION_CYCLE_DAYS,
    min: 1,
    max: 366,
  },
  budgetMinUsd: {
    kind: 'usd',
    label: 'Smallest request budget',
    help: 'Lowest "up to" amount a client can pick when asking for a stylist.',
    group: 'Requests',
    env: 'BUDGET_MIN_USD',
    public: true,
    default: BUDGET_MIN_USD,
    min: 1,
    max: 10_000,
  },
  budgetMaxUsd: {
    kind: 'usd',
    label: 'Largest request budget',
    help: 'Highest "up to" amount a client can pick when asking for a stylist.',
    group: 'Requests',
    env: 'BUDGET_MAX_USD',
    public: true,
    default: BUDGET_MAX_USD,
    min: 1,
    max: 10_000,
  },
  budgetStepUsd: {
    kind: 'usd',
    label: 'Budget step',
    help: 'Amount the budget slider moves by.',
    group: 'Requests',
    env: 'BUDGET_STEP_USD',
    public: true,
    default: BUDGET_STEP_USD,
    min: 1,
    max: 1_000,
  },
  supportPhone: {
    kind: 'text',
    label: 'Support phone',
    help: 'Shown on the Help and support screen. Leave empty until confirmed.',
    group: 'Support contacts',
    env: 'SUPPORT_PHONE',
    public: true,
    default: '',
    maxLength: 60,
  },
  supportWhatsapp: {
    kind: 'text',
    label: 'Support WhatsApp',
    help: 'WhatsApp number for support, if any.',
    group: 'Support contacts',
    env: 'SUPPORT_WHATSAPP',
    public: true,
    default: '',
    maxLength: 60,
  },
  supportEmail: {
    kind: 'text',
    label: 'Support email',
    help: 'Email address for support.',
    group: 'Support contacts',
    env: 'SUPPORT_EMAIL',
    public: true,
    default: '',
    maxLength: 120,
  },
  supportHours: {
    kind: 'text',
    label: 'Support hours',
    help: 'For example "Mon–Fri 8:00–17:00, Sat 8:00–13:00".',
    group: 'Support contacts',
    env: 'SUPPORT_HOURS',
    public: true,
    default: '',
    maxLength: 120,
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

type ValueOf<D> = D extends { kind: 'text' } ? string : number;
export type PlatformSettings = { [K in SettingKey]: ValueOf<(typeof SETTING_DEFINITIONS)[K]> };

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFINITIONS, key);
}

/** The built-in defaults, used before anything is configured. */
export function defaultSettings(): PlatformSettings {
  const out: Record<string, number | string> = {};
  for (const key of SETTING_KEYS) out[key] = SETTING_DEFINITIONS[key].default;
  return out as PlatformSettings;
}

/**
 * Checks a value against its definition. Returns the cleaned value, or an
 * error message. Used for console input and for environment variables alike,
 * so a typo in either can never put an out-of-range value into effect.
 */
export function parseSettingValue(
  key: SettingKey,
  raw: unknown,
): { ok: true; value: number | string } | { ok: false; error: string } {
  const def: SettingDefinition = SETTING_DEFINITIONS[key];
  if (def.kind === 'text') {
    if (typeof raw !== 'string') return { ok: false, error: `${def.label} must be text` };
    const value = raw.trim();
    if (value.length > def.maxLength) {
      return {
        ok: false,
        error: `${def.label} must be at most ${String(def.maxLength)} characters`,
      };
    }
    return { ok: true, value };
  }
  const num = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof num !== 'number' || !Number.isInteger(num)) {
    return { ok: false, error: `${def.label} must be a whole number` };
  }
  if (num < def.min || num > def.max) {
    return {
      ok: false,
      error: `${def.label} must be between ${String(def.min)} and ${String(def.max)}`,
    };
  }
  return { ok: true, value: num };
}

/**
 * Checks values that only make sense together. Returns an error message or
 * null. Run on the merged result of a change, before saving it.
 */
export function checkSettingsConsistency(settings: PlatformSettings): string | null {
  if (settings.budgetMinUsd > settings.budgetMaxUsd) {
    return 'Smallest request budget cannot be above the largest';
  }
  if ((settings.budgetMaxUsd - settings.budgetMinUsd) % settings.budgetStepUsd !== 0) {
    return 'The budget range must divide evenly into budget steps';
  }
  return null;
}

/** Budget amounts the request screen offers and the server accepts. */
export function isBudgetAmountAllowed(amountUsd: number, settings: PlatformSettings): boolean {
  if (!Number.isInteger(amountUsd)) return false;
  if (amountUsd < settings.budgetMinUsd || amountUsd > settings.budgetMaxUsd) return false;
  return (amountUsd - settings.budgetMinUsd) % settings.budgetStepUsd === 0;
}

/** The nearest allowed budget amount, for a slider whose range just changed. */
export function snapBudgetAmount(amountUsd: number, settings: PlatformSettings): number {
  const { budgetMinUsd: min, budgetMaxUsd: max, budgetStepUsd: step } = settings;
  const clamped = Math.min(Math.max(amountUsd, min), max);
  return min + Math.round((clamped - min) / step) * step;
}
