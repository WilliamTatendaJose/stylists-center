import { describe, expect, it } from 'vitest';
import { createMatchRequestSchema } from './matching.js';
import { createBookingSchema } from './bookings.js';
import { firebaseExchangeSchema } from './auth.js';
import { imageUrlSchema } from './uploads.js';
import { paySubscriptionSchema } from './subscription.js';
import {
  adminLoginSchema,
  createManualBanSchema,
  resolveAppealSchema,
  updateProviderAdminSchema,
  updateReportStatusSchema,
} from './admin.js';

/**
 * These schemas are the actual API contract — a thin smoke test that they
 * accept the shape the client sends and reject the shapes the domain rules
 * forbid, so a schema typo fails here instead of as a confusing 400 on device.
 *
 * Fixture IDs below use the RFC 4122 variant nibble (8/9/a/b in the third
 * group) deliberately — zod v4's `.uuid()` enforces it, and an all-'1's
 * placeholder like `1111-1111-1111-1111` is correctly rejected as not a real
 * UUID rather than being a schema bug.
 */
const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';

describe('imageUrlSchema', () => {
  it('accepts API uploads and HTTPS-hosted images', () => {
    expect(
      imageUrlSchema.safeParse('/uploads/3a6f010d-1d13-4a06-a747-0ae1b4be35d0.jpg').success,
    ).toBe(true);
    expect(imageUrlSchema.safeParse('https://cdn.example.com/work.webp').success).toBe(true);
  });

  it('rejects scripts, local files, and arbitrary relative paths', () => {
    expect(imageUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(imageUrlSchema.safeParse('file:///private/photo.jpg').success).toBe(false);
    expect(imageUrlSchema.safeParse('../photo.jpg').success).toBe(false);
  });
});

describe('createMatchRequestSchema', () => {
  const valid = {
    categoryId: PROVIDER_ID,
    budget: { mode: 'flex' as const },
    radiusKm: 3,
    location: { lat: -17.7955, lng: 31.033 },
  };

  it('accepts a flexible-budget request at a valid starting radius', () => {
    expect(createMatchRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid fixed budget', () => {
    const result = createMatchRequestSchema.safeParse({
      ...valid,
      budget: { mode: 'fixed', amountUsd: 30 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts any radius in the free-range window, not just fixed rungs', () => {
    expect(createMatchRequestSchema.safeParse({ ...valid, radiusKm: 5 }).success).toBe(true);
    expect(createMatchRequestSchema.safeParse({ ...valid, radiusKm: 50 }).success).toBe(true);
  });

  it('rejects a radius outside the allowed window', () => {
    expect(createMatchRequestSchema.safeParse({ ...valid, radiusKm: 0 }).success).toBe(false);
    expect(createMatchRequestSchema.safeParse({ ...valid, radiusKm: 51 }).success).toBe(false);
  });

  it('rejects a fixed budget amount off the step boundary', () => {
    const result = createMatchRequestSchema.safeParse({
      ...valid,
      budget: { mode: 'fixed', amountUsd: 31 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range latitude', () => {
    const result = createMatchRequestSchema.safeParse({
      ...valid,
      location: { lat: 200, lng: 31.033 },
    });
    expect(result.success).toBe(false);
  });
});

describe('createBookingSchema', () => {
  it('accepts a minimal EcoCash booking', () => {
    const result = createBookingSchema.safeParse({
      providerId: PROVIDER_ID,
      serviceId: SERVICE_ID,
      startsAt: '2026-07-30T14:30:00.000Z',
      paymentMethod: 'ecocash',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO startsAt', () => {
    const result = createBookingSchema.safeParse({
      providerId: PROVIDER_ID,
      serviceId: SERVICE_ID,
      startsAt: '30 July 2026',
      paymentMethod: 'cash',
    });
    expect(result.success).toBe(false);
  });
});

describe('paySubscriptionSchema', () => {
  it('accepts EcoCash and rejects unverified self-reported cash renewals', () => {
    expect(
      paySubscriptionSchema.safeParse({
        paymentMethod: 'ecocash',
        payerPhone: '077 000 0000',
      }).success,
    ).toBe(true);
    expect(paySubscriptionSchema.safeParse({ paymentMethod: 'cash' }).success).toBe(false);
  });
});

describe('auth schemas', () => {
  it('requires a Firebase ID token for session exchange', () => {
    expect(firebaseExchangeSchema.safeParse({ idToken: 'firebase-token' }).success).toBe(true);
    expect(firebaseExchangeSchema.safeParse({ idToken: '' }).success).toBe(false);
  });
});

describe('admin schemas', () => {
  it('rejects an admin login with a malformed email or an empty password', () => {
    expect(adminLoginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(
      false,
    );
    expect(adminLoginSchema.safeParse({ email: 'staff@example.com', password: '' }).success).toBe(
      false,
    );
    expect(adminLoginSchema.safeParse({ email: 'staff@example.com', password: 'x' }).success).toBe(
      true,
    );
  });

  it('rejects a manual ban with no reason', () => {
    expect(createManualBanSchema.safeParse({ userId: PROVIDER_ID, reason: '' }).success).toBe(
      false,
    );
    expect(
      createManualBanSchema.safeParse({ userId: PROVIDER_ID, reason: 'Repeated harassment' })
        .success,
    ).toBe(true);
  });

  it('rejects resolving an appeal back to "none" — that is not a resolution', () => {
    expect(resolveAppealSchema.safeParse({ appealStatus: 'none' }).success).toBe(false);
    expect(resolveAppealSchema.safeParse({ appealStatus: 'overturned' }).success).toBe(true);
  });

  it('accepts a report status transition with an optional note', () => {
    expect(updateReportStatusSchema.safeParse({ status: 'reviewing' }).success).toBe(true);
    expect(
      updateReportStatusSchema.safeParse({ status: 'resolved', resolutionNote: 'Warned user' })
        .success,
    ).toBe(true);
  });

  it('rejects a provider update with neither field set', () => {
    expect(updateProviderAdminSchema.safeParse({}).success).toBe(false);
    expect(updateProviderAdminSchema.safeParse({ verified: true }).success).toBe(true);
    expect(updateProviderAdminSchema.safeParse({ subscriptionPriceUsdCents: 500 }).success).toBe(
      true,
    );
  });
});
