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
import { CASH_OUT_MIN_USD_CENTS, REFERRAL_REWARD_COINS } from './money.js';
import { DEFAULT_SUBSCRIPTION_PRICE_USD_CENTS, SUBSCRIPTION_CYCLE_DAYS } from './subscription.js';

/** How a value is entered and displayed. Money is always integer USD cents. */
/**
 * - bps: a percentage stored in basis points (300 = 3%), entered as a percent.
 * - count: a plain whole number (hours, months, day of the month).
 */
export type SettingKind = 'cents' | 'coins' | 'days' | 'usd' | 'bps' | 'count' | 'text';

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
  /** When set, the value must be one of these (shown as a choice in the console). */
  options?: readonly { value: string; label: string }[];
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
    // Confirmed by StylistsCenter: 1 coin = $0.10. (The older code constant,
    // COIN_USD_CENTS, stays 20 for history; this is the value in effect.)
    default: 10,
    min: 1,
    max: 10_000,
  },
  referralRewardCoins: {
    kind: 'coins',
    label: 'Referral reward',
    help: 'Coins credited to an agent for each agent they recruit, once that agent is verified and has paid their first subscription.',
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
    label: 'Agent subscription price',
    help: 'Monthly subscription agents pay to use the rewards programme. Stylists pay a service fee per job instead.',
    group: 'Subscriptions',
    env: 'SUBSCRIPTION_PRICE_USD_CENTS',
    public: true,
    default: DEFAULT_SUBSCRIPTION_PRICE_USD_CENTS,
    min: 0,
    max: 10_000_000,
  },
  subscriptionCycleDays: {
    kind: 'days',
    label: 'Agent subscription length',
    help: 'Days of cover one agent subscription payment buys, counted from the day it is paid.',
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
  serviceFeePaidBy: {
    kind: 'text',
    label: 'Service fee paid by',
    help: "Client: the fee is added to the price the client sees ($20 job shows $20.60). Stylist: the client pays the listed price and the fee comes out of the stylist's side. Either way the stylist collects the money and the fee is on their monthly bill. Applies to new bookings.",
    group: 'Fees and billing',
    env: 'SERVICE_FEE_PAID_BY',
    public: true,
    default: 'client',
    maxLength: 20,
    options: [
      { value: 'client', label: 'Client (added to the price)' },
      { value: 'stylist', label: 'Stylist (client pays the listed price)' },
    ],
  },
  serviceFeeBps: {
    kind: 'bps',
    label: 'Service fee on bookings',
    help: 'Added to the service price the client sees (a $20 job shows $20.60 at 3%). The stylist is paid directly and owes this fee to StylistsCenter.',
    group: 'Fees and billing',
    env: 'SERVICE_FEE_BPS',
    public: true,
    default: 300,
    min: 0,
    max: 5_000,
  },
  marketplaceFeeBps: {
    kind: 'bps',
    label: 'Marketplace commission',
    help: 'Charged to the vendor on the product total of each delivered or collected order, excluding the delivery charge.',
    group: 'Fees and billing',
    env: 'MARKETPLACE_FEE_BPS',
    public: true,
    default: 300,
    min: 0,
    max: 5_000,
  },
  billingDueDay: {
    kind: 'count',
    label: 'Fee balance due day',
    help: "Day of the month a stylist's or vendor's fees for the previous month are due.",
    group: 'Fees and billing',
    env: 'BILLING_DUE_DAY',
    public: true,
    default: 5,
    min: 1,
    max: 28,
  },
  feeReminderDaysBefore: {
    kind: 'days',
    label: 'First reminder before due date',
    help: 'Days before the due date that the first payment reminder is sent. Another is sent on the due date.',
    group: 'Fees and billing',
    env: 'FEE_REMINDER_DAYS_BEFORE',
    public: false,
    default: 3,
    min: 0,
    max: 28,
  },
  feeReminderDaysAfter: {
    kind: 'days',
    label: 'Overdue reminder',
    help: 'Days after the due date that an overdue reminder is sent.',
    group: 'Fees and billing',
    env: 'FEE_REMINDER_DAYS_AFTER',
    public: false,
    default: 7,
    min: 1,
    max: 60,
  },
  feeRestrictAfterDays: {
    kind: 'days',
    label: 'Restrict account after',
    help: 'Days after the due date that an unpaid account is restricted: no new bookings or sales until the balance is paid.',
    group: 'Fees and billing',
    env: 'FEE_RESTRICT_AFTER_DAYS',
    public: true,
    default: 30,
    min: 1,
    max: 365,
  },
  completionAutoConfirmHours: {
    kind: 'count',
    label: 'Auto-complete a job after (hours)',
    help: 'If only the stylist or only the client confirms a job, it is treated as completed after this many hours.',
    group: 'Bookings',
    env: 'COMPLETION_AUTO_CONFIRM_HOURS',
    public: true,
    default: 48,
    min: 1,
    max: 720,
  },
  nonPaymentReportHours: {
    kind: 'count',
    label: 'Report non-payment within (hours)',
    help: 'A stylist who reports that a client did not pay within this many hours of the appointment is not charged the fee for that job.',
    group: 'Bookings',
    env: 'NON_PAYMENT_REPORT_HOURS',
    public: true,
    default: 48,
    min: 1,
    max: 720,
  },
  rewardSpendUsdPerCoin: {
    kind: 'usd',
    label: 'Client spend per reward coin',
    help: 'Clients earn 1 coin for every this-many dollars spent on completed bookings and marketplace purchases, rounded down to whole coins.',
    group: 'Wallet and rewards',
    env: 'REWARD_SPEND_USD_PER_COIN',
    public: true,
    default: 10,
    min: 1,
    max: 10_000,
  },
  agentRewardSpendUsdPerCoin: {
    kind: 'usd',
    label: 'Agent: purchase amount per coin',
    help: 'Agents earn 1 coin for every this-many dollars a referred customer spends on the marketplace, rounded down to whole coins (a smaller purchase earns nothing).',
    group: 'Wallet and rewards',
    env: 'AGENT_REWARD_SPEND_USD_PER_COIN',
    public: true,
    default: 10,
    min: 1,
    max: 10_000,
  },
  agentMinPurchaseUsd: {
    kind: 'usd',
    label: 'Agent: minimum purchase to earn',
    help: "A referred customer's marketplace purchase must be at least this much (product total) before the agent earns anything on it.",
    group: 'Wallet and rewards',
    env: 'AGENT_MIN_PURCHASE_USD',
    public: true,
    default: 10,
    min: 0,
    max: 10_000,
  },
  agentSubscriptionReminderDays: {
    kind: 'days',
    label: 'Agent subscription reminder',
    help: "Days before an agent's subscription ends that they get a reminder to renew. They are also told on the day it ends.",
    group: 'Subscriptions',
    env: 'AGENT_SUBSCRIPTION_REMINDER_DAYS',
    public: false,
    default: 3,
    min: 1,
    max: 30,
  },
  cashOutPayoutDays: {
    kind: 'days',
    label: 'Cash-outs paid within',
    help: 'Days after staff approve a cash-out within which it is paid to the EcoCash number. Shown in the app; keep it in line with the Terms and Conditions.',
    group: 'Wallet and rewards',
    env: 'CASH_OUT_PAYOUT_DAYS',
    public: true,
    default: 30,
    min: 1,
    max: 90,
  },
  coinExpiryMonths: {
    kind: 'count',
    label: 'Client coins expire after (months)',
    help: 'Coins a client earns expire this many months after they were earned.',
    group: 'Wallet and rewards',
    env: 'COIN_EXPIRY_MONTHS',
    public: true,
    default: 12,
    min: 1,
    max: 120,
  },
  referralAttributionMonths: {
    kind: 'count',
    label: 'Referral earnings last (months)',
    help: "An agent earns on a customer's purchases for this many months after the customer first uses the agent's code.",
    group: 'Wallet and rewards',
    env: 'REFERRAL_ATTRIBUTION_MONTHS',
    public: true,
    default: 12,
    min: 1,
    max: 120,
  },
  cashOutIntervalDays: {
    kind: 'days',
    label: 'Cash-out frequency',
    help: 'An agent or stylist can request a cash-out at most once in this many days.',
    group: 'Wallet and rewards',
    env: 'CASH_OUT_INTERVAL_DAYS',
    public: true,
    default: 30,
    min: 0,
    max: 365,
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
    if (def.options && !def.options.some((option) => option.value === value)) {
      return {
        ok: false,
        error: `${def.label} must be one of: ${def.options.map((o) => o.value).join(', ')}`,
      };
    }
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
type BudgetSettings = Pick<PlatformSettings, 'budgetMinUsd' | 'budgetMaxUsd' | 'budgetStepUsd'>;

export function isBudgetAmountAllowed(amountUsd: number, settings: BudgetSettings): boolean {
  if (!Number.isInteger(amountUsd)) return false;
  if (amountUsd < settings.budgetMinUsd || amountUsd > settings.budgetMaxUsd) return false;
  return (amountUsd - settings.budgetMinUsd) % settings.budgetStepUsd === 0;
}

/** The nearest allowed budget amount, for a slider whose range just changed. */
export function snapBudgetAmount(amountUsd: number, settings: BudgetSettings): number {
  const { budgetMinUsd: min, budgetMaxUsd: max, budgetStepUsd: step } = settings;
  const clamped = Math.min(Math.max(amountUsd, min), max);
  return min + Math.round((clamped - min) / step) * step;
}
