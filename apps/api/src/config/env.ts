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

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_PEPPER: z.string().min(32),

    AUTH_DEV_OTP: z
      .string()
      .length(6)
      .regex(/^\d{6}$/)
      .optional(),

    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
    COIN_USD_CENTS: z.coerce.number().int().positive().default(50),
    CASH_OUT_MIN_USD_CENTS: z.coerce.number().int().positive().default(500),

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
