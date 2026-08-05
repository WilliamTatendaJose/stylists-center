import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { TrustService } from '../trust/trust.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/**
 * Integration-style, against a real Postgres (sc_test) and real Redis — no
 * Testcontainers daemon in this sandbox, so this runs the same way the
 * matching module's Phase-3 tests will (plan §8's "integration, must have"
 * tier). `sc_test` is migrated separately from `sc_dev` (see prisma
 * migrate deploy against DATABASE_URL=.../sc_test), never seeded, so a test
 * run never touches demo data.
 */
const TEST_DATABASE_URL = 'postgresql://sc:sc@localhost:5433/sc_test';
const TEST_PHONE = '+263779999001';

const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  AUTH_DEV_OTP: undefined,
  PLATFORM_FEE_BPS: 500,
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
};

// Two configs: `plainConfig` has no AUTH_DEV_OTP (exercises the real
// hash-comparison path), `devConfig` mirrors how every other test in the
// suite actually authenticates (the AUTH_DEV_OTP bypass), since manufacturing
// a real 6-digit code would mean reading Redis internals from the test.
const plainConfig = new ConfigService<Env, true>(BASE_ENV);
const devConfig = new ConfigService<Env, true>({ ...BASE_ENV, AUTH_DEV_OTP: '000000' });

describe('AuthService', () => {
  let prisma: PrismaService;
  let redis: Redis;
  let plainAuth: AuthService;
  let auth: AuthService;
  let cityId: string;
  let categoryId: string;

  beforeAll(async () => {
    prisma = new PrismaService(plainConfig);
    await prisma.onModuleInit();
    redis = new Redis('redis://localhost:6380');
    const trust = new TrustService(prisma);
    plainAuth = new AuthService(prisma, new JwtService(), plainConfig, trust, redis);
    auth = new AuthService(prisma, new JwtService(), devConfig, trust, redis);

    const city =
      (await prisma.city.findFirst()) ??
      (await prisma.city.create({
        data: {
          name: 'Harare',
          timezone: 'Africa/Harare',
          centroidLat: -17.8252,
          centroidLng: 31.0335,
          bboxWest: 30.9,
          bboxSouth: -18.0,
          bboxEast: 31.2,
          bboxNorth: -17.6,
        },
      }));
    cityId = city.id;

    const category = await prisma.category.create({ data: { name: 'auth-spec-category' } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.onModuleDestroy();
    redis.disconnect();
  });

  async function cleanup() {
    await prisma.service.deleteMany({
      where: { provider: { user: { phone: { startsWith: '+26377999' } } } },
    });
    await prisma.providerProfile.deleteMany({
      where: { user: { phone: { startsWith: '+26377999' } } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { phone: { startsWith: '+26377999' } } },
    });
    await prisma.user.deleteMany({ where: { phone: { startsWith: '+26377999' } } });
    const keys = await redis.keys('otp:*');
    if (keys.length) await redis.del(...keys);
  }

  beforeEach(cleanup);

  it('creates a new user on first verified OTP and returns tokens', async () => {
    const { challengeId } = await auth.requestOtp(TEST_PHONE, '127.0.0.1');
    const tokens = await auth.verifyOtp(challengeId, '000000');

    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));

    const user = await prisma.user.findUnique({ where: { phone: TEST_PHONE } });
    expect(user).not.toBeNull();
    expect(user?.activeRole).toBe('client');
  });

  it('rejects the wrong code against a real (non-dev-bypass) challenge', async () => {
    const { challengeId } = await plainAuth.requestOtp(TEST_PHONE, '127.0.0.1');
    await expect(plainAuth.verifyOtp(challengeId, '111111')).rejects.toThrow('Incorrect code');
  });

  it('locks a challenge out after 5 incorrect attempts', async () => {
    const { challengeId } = await auth.requestOtp(TEST_PHONE, '127.0.0.1');

    for (let i = 0; i < 4; i++) {
      await expect(auth.verifyOtp(challengeId, '111111')).rejects.toThrow('Incorrect code');
    }
    await expect(auth.verifyOtp(challengeId, '111111')).rejects.toThrow(
      'Too many incorrect attempts',
    );
    // The challenge is now deleted — even the correct code no longer works.
    await expect(auth.verifyOtp(challengeId, '000000')).rejects.toThrow(
      'Challenge expired or not found',
    );
  });

  it('rate-limits OTP requests per phone number', async () => {
    for (let i = 0; i < 5; i++) {
      await auth.requestOtp(TEST_PHONE, '127.0.0.1');
    }
    await expect(auth.requestOtp(TEST_PHONE, '127.0.0.1')).rejects.toThrow('Too many requests');
  });

  it('rotates the refresh token on use and detects reuse of a stale token', async () => {
    const { challengeId } = await auth.requestOtp(TEST_PHONE, '127.0.0.1');
    const first = await auth.verifyOtp(challengeId, '000000');

    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Replaying the now-rotated-away first token must fail AND revoke the family...
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow('reuse detected');
    // ...which means the second (legitimately rotated) token stops working too.
    await expect(auth.refresh(second.refreshToken)).rejects.toThrow('reuse detected');
  });

  it('me() reflects hasProviderProfile, and setActiveRole() refuses provider without a stylist page', async () => {
    const { challengeId } = await auth.requestOtp(TEST_PHONE, '127.0.0.1');
    const tokens = await auth.verifyOtp(challengeId, '000000');

    const { id } = await auth.verifyAccessToken(tokens.accessToken);
    const me = await auth.me(id);
    expect(me.hasProviderProfile).toBe(false);
    expect(me.activeRole).toBe('client');

    // No stylist page yet — the switch must be refused, not silently allowed
    // into a provider side of the app with nothing behind it.
    await expect(auth.setActiveRole(id, 'provider')).rejects.toThrow(
      'This account does not have a stylist page yet',
    );

    await prisma.providerProfile.create({
      data: {
        userId: id,
        displayName: 'Auth Spec Stylist',
        tint: '#ec3013',
        initials: 'AS',
        categoryId,
        areaName: 'Avondale',
        latitude: -17.8,
        longitude: 31.03,
        cityId,
        workingHoursLabel: 'Mon-Sat, 8am-6pm',
      },
    });

    const withProfile = await auth.me(id);
    expect(withProfile.hasProviderProfile).toBe(true);

    const updated = await auth.setActiveRole(id, 'provider');
    expect(updated.activeRole).toBe('provider');
  });
});
