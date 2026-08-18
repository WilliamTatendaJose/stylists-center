import { z } from 'zod';

/**
 * Boot-time environment validation. Fails fast with a clear error instead of
 * the app starting and failing mysteriously later (a missing JWT secret
 * surfacing as a cryptic 500 on the first login attempt, say).
 *
 * `AUTH_DEV_OTP` is the one field with a real safety rule attached: it lets
 * every OTP verify against a fixed code so screens can be built and demoed
 * without an SMS/WhatsApp bill (plan §6, §11 R4). The `.superRefine` below
 * makes it impossible for that shortcut to exist in a production config —
 * not just a convention, an enforced boot failure.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    // Origin-relative image URLs are stored in Postgres; this is the durable
    // directory that backs /uploads. Mount it as a persistent volume in prod.
    UPLOAD_DIR: z.string().min(1).default('uploads'),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_PEPPER: z.string().min(32),

    // Deliberately separate secrets from the user-facing JWT above: an admin
    // token must never be verifiable (or forgeable) against the client/
    // provider token space, and vice versa.
    ADMIN_JWT_ACCESS_SECRET: z.string().min(32),
    ADMIN_JWT_REFRESH_PEPPER: z.string().min(32),
    // The one browser origin allowed to send credentialed (cookie-bearing)
    // requests to /v1/admin/* — CORS is tightened to just this origin rather
    // than the mobile app's app.enableCors() default, since only a browser
    // client needs the admin refresh cookie at all.
    ADMIN_WEB_ORIGIN: z.url().default('http://localhost:5173'),

    AUTH_DEV_OTP: z
      .string()
      .length(6)
      .regex(/^\d{6}$/)
      .optional(),
    // Infobip delivers OTP codes in production: a WhatsApp template message
    // first (preferred in Zimbabwe), SMS as the automatic fallback when
    // WhatsApp cannot deliver to a particular number. Infobip does not host
    // the code itself (unlike Twilio Verify) — AuthService generates it and
    // only calls Infobip to deliver it, hashing+comparing locally.
    INFOBIP_API_KEY: z.string().min(20).optional(),
    // Bare host from the Infobip dashboard, e.g. "xxxxx.api.infobip.com" —
    // no scheme; auth.service.ts prefixes https:// when building request URLs.
    INFOBIP_BASE_URL: z.string().min(1).optional(),
    // WhatsApp Business sender registered on the Infobip account.
    INFOBIP_WHATSAPP_SENDER: z.string().min(1).optional(),
    // Name of the pre-approved WhatsApp template used for the OTP message —
    // WhatsApp requires business-initiated messages to use an approved
    // template; free-form text is rejected.
    INFOBIP_WHATSAPP_TEMPLATE_NAME: z.string().min(1).optional(),
    // Optional alphanumeric sender ID for the SMS fallback; when unset,
    // Infobip uses the account's default sender.
    INFOBIP_SMS_SENDER: z.string().min(1).optional(),
    INFOBIP_DEFAULT_CHANNEL: z.enum(['whatsapp', 'sms']).default('whatsapp'),

    // Paynow is the selected collection provider. It remains optional in
    // development so the fake adapter keeps local and integration tests free.
    PAYMENT_PROVIDER: z.enum(['fake', 'paynow']).default('fake'),
    PAYNOW_INTEGRATION_ID: z.string().min(1).optional(),
    PAYNOW_INTEGRATION_KEY: z.string().min(20).optional(),
    PAYNOW_RETURN_URL: z.url().optional(),
    PAYNOW_RESULT_URL: z.url().optional(),
    // Bookings push an EcoCash prompt straight to the client's phone (Paynow's
    // Express Checkout / "mobile transaction" API) instead of opening a
    // browser. That endpoint requires authemail — in test mode it must match
    // one of the merchant account's own login emails, not the customer's.
    PAYNOW_AUTH_EMAIL: z.email().optional(),

    COIN_USD_CENTS: z.coerce.number().int().positive().default(50),
    CASH_OUT_MIN_USD_CENTS: z.coerce.number().int().positive().default(500),

    // Expo's push service accepts unauthenticated sends, so this is optional
    // and everything works without it. Setting it (expo.dev → account settings
    // → Access Tokens) means only this server can push to the project's
    // devices — worth doing in production, where a leaked push token would
    // otherwise let anyone send notifications to your users.
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    // Where Expo's push API lives. A variable rather than a constant purely so
    // tests can point it at a local stub instead of the internet.
    EXPO_PUSH_API_URL: z.url().default('https://exp.host/--/api/v2/push/send'),

    // Free public demo instance — no key, no cost, fine for dev/testing. A
    // self-hosted OSRM or a paid Directions API is the production swap (plan
    // risk R2); one env var is the entire migration since geo.service.ts
    // only ever calls whatever this points at.
    OSRM_BASE_URL: z.url().default('https://router.project-osrm.org'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AUTH_DEV_OTP) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_DEV_OTP'],
        message: 'AUTH_DEV_OTP must not be set in production — it bypasses real OTP verification.',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of [
        'INFOBIP_API_KEY',
        'INFOBIP_BASE_URL',
        'INFOBIP_WHATSAPP_SENDER',
        'INFOBIP_WHATSAPP_TEMPLATE_NAME',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required in production for Infobip OTP delivery.`,
          });
        }
      }
      if (env.PAYMENT_PROVIDER !== 'paynow') {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENT_PROVIDER'],
          message: 'PAYMENT_PROVIDER must be paynow in production.',
        });
      }
      for (const key of [
        'PAYNOW_INTEGRATION_ID',
        'PAYNOW_INTEGRATION_KEY',
        'PAYNOW_RETURN_URL',
        'PAYNOW_RESULT_URL',
        'PAYNOW_AUTH_EMAIL',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required in production for Paynow.`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Passed to @nestjs/config's `ConfigModule.forRoot({ validate })`. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
