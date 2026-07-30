import { describe, expect, it } from 'vitest';
import { createMatchRequestSchema } from './matching.js';
import { createBookingSchema } from './bookings.js';
import { requestOtpSchema, verifyOtpSchema } from './auth.js';

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

describe('createMatchRequestSchema', () => {
  const valid = {
    categoryId: PROVIDER_ID,
    budget: { mode: 'flex' as const },
    radiusKm: 3,
    location: { lat: -17.7955, lng: 31.033 },
  };

  it('accepts a flexible-budget request at a ladder radius', () => {
    expect(createMatchRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid fixed budget', () => {
    const result = createMatchRequestSchema.safeParse({
      ...valid,
      budget: { mode: 'fixed', amountUsd: 30 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a radius off the ladder', () => {
    const result = createMatchRequestSchema.safeParse({ ...valid, radiusKm: 5 });
    expect(result.success).toBe(false);
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

describe('auth schemas', () => {
  it('accepts a plausible phone string for OTP request', () => {
    expect(requestOtpSchema.safeParse({ phone: '0771234567' }).success).toBe(true);
  });

  it('rejects a code that is not exactly 6 digits', () => {
    const challengeId = PROVIDER_ID;
    expect(verifyOtpSchema.safeParse({ challengeId, code: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ challengeId, code: 'abcdef' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ challengeId, code: '000000' }).success).toBe(true);
  });
});
