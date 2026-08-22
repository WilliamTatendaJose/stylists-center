import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { FirebaseIdentityService } from './firebase-identity.service';
import { TrustService } from '../trust/trust.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const TEST_EMAIL = 'firebase-auth-spec@example.com';

const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  UPLOAD_DIR: 'uploads',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-at-least-32-characters-long',
  ADMIN_JWT_REFRESH_PEPPER: 'test-admin-refresh-pepper-at-least-32-characters-long',
  ADMIN_WEB_ORIGIN: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'fake',
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
  ANDROID_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=zw.co.stylistscenter.app',
};

const config = new ConfigService<Env, true>(BASE_ENV);

describe('AuthService Firebase exchange', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let cityId: string;
  let categoryId: string;
  const verifiedIdentity = {
    uid: 'firebase-auth-spec-uid',
    email: TEST_EMAIL,
    emailVerified: true,
    displayName: 'Firebase Auth Spec',
    photoUrl: null,
    phoneNumber: null,
  };
  const verifyIdToken = vi.fn(() => Promise.resolve(verifiedIdentity));

  beforeAll(async () => {
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const firebaseIdentity = { verifyIdToken } as unknown as FirebaseIdentityService;
    auth = new AuthService(
      prisma,
      new JwtService(),
      config,
      new TrustService(prisma),
      firebaseIdentity,
    );

    const city = await prisma.city.create({
      data: {
        name: `auth-spec-${String(Date.now())}`,
        timezone: 'Africa/Harare',
        centroidLat: -17.8252,
        centroidLng: 31.0335,
        bboxWest: 30.9,
        bboxSouth: -18.0,
        bboxEast: 31.2,
        bboxNorth: -17.6,
      },
    });
    cityId = city.id;
    categoryId = (await prisma.category.create({ data: { name: 'auth-spec-category' } })).id;
  });

  async function cleanup() {
    await prisma.service.deleteMany({ where: { provider: { user: { email: TEST_EMAIL } } } });
    await prisma.providerProfile.deleteMany({ where: { user: { email: TEST_EMAIL } } });
    await prisma.refreshToken.deleteMany({ where: { user: { email: TEST_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  }

  beforeEach(async () => {
    await cleanup();
    verifyIdToken.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('creates an app user from a verified Firebase identity and returns tokens', async () => {
    const tokens = await auth.exchangeFirebaseToken('firebase-id-token');
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(verifyIdToken).toHaveBeenCalledWith('firebase-id-token');

    expect(
      await prisma.user.findUnique({ where: { firebaseUid: verifiedIdentity.uid } }),
    ).toMatchObject({
      email: TEST_EMAIL,
      displayName: verifiedIdentity.displayName,
      activeRole: 'client',
    });
  });

  it('rejects an unverified email before creating an app user', async () => {
    verifyIdToken.mockResolvedValueOnce({ ...verifiedIdentity, emailVerified: false });
    await expect(auth.exchangeFirebaseToken('unverified-token')).rejects.toThrow(
      'Verify your email',
    );
    expect(await prisma.user.findUnique({ where: { email: TEST_EMAIL } })).toBeNull();
  });

  it('rotates refresh tokens and detects replay', async () => {
    const first = await auth.exchangeFirebaseToken('firebase-id-token');
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow('reuse detected');
    await expect(auth.refresh(second.refreshToken)).rejects.toThrow('reuse detected');
  });

  it('keeps role and provider authorization behavior after Firebase sign-in', async () => {
    const tokens = await auth.exchangeFirebaseToken('firebase-id-token');
    const { id } = await auth.verifyAccessToken(tokens.accessToken);
    expect(await auth.me(id)).toMatchObject({
      email: TEST_EMAIL,
      hasProviderProfile: false,
      activeRole: 'client',
    });

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
    expect((await auth.setActiveRole(id, 'provider')).activeRole).toBe('provider');
  });
});
