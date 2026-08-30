import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { FirebaseIdentityService } from './firebase-identity.service';
import { UserLifecycleService } from './user-lifecycle.service';
import { ImageStorageService } from '../provider/image-storage.service';
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
  const getAccountStatus = vi.fn(() =>
    Promise.resolve<'active' | 'disabled' | 'missing'>('active'),
  );

  beforeAll(async () => {
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const firebaseIdentity = {
      verifyIdToken,
      getAccountStatus,
    } as unknown as FirebaseIdentityService;
    auth = new AuthService(
      prisma,
      new JwtService(),
      config,
      new TrustService(prisma),
      firebaseIdentity,
      new UserLifecycleService(prisma, new ImageStorageService(config)),
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
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: TEST_EMAIL },
          { firebaseUid: { startsWith: 'firebase-auth-spec-uid' } },
          { displayName: { startsWith: 'Deleted user' }, cityId },
        ],
      },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.service.deleteMany({ where: { provider: { userId: { in: userIds } } } });
    await prisma.providerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeEach(async () => {
    await cleanup();
    verifyIdToken.mockClear();
    getAccountStatus.mockClear();
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

  it('starts fresh when Firebase confirms the previous identity was deleted', async () => {
    await auth.exchangeFirebaseToken('firebase-id-token');
    const original = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    expect(original).not.toBeNull();
    if (!original) throw new Error('Expected the original user to exist');

    verifyIdToken.mockResolvedValueOnce({ ...verifiedIdentity, uid: 'firebase-auth-spec-uid-2' });
    getAccountStatus.mockResolvedValueOnce('missing');
    const tokens = await auth.exchangeFirebaseToken('replacement-id-token');
    expect(tokens.accessToken).toEqual(expect.any(String));

    const replacement = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    expect(replacement?.id).not.toBe(original.id);
    expect(replacement).toMatchObject({
      firebaseUid: 'firebase-auth-spec-uid-2',
      activeRole: 'client',
    });
    const tombstoned = await prisma.user.findUnique({ where: { id: original.id } });
    expect(tombstoned).toMatchObject({
      email: null,
      firebaseUid: null,
    });
    expect(tombstoned?.deletedAt).toBeInstanceOf(Date);
  });

  it('does not use email to adopt a different live Firebase identity', async () => {
    await auth.exchangeFirebaseToken('firebase-id-token');
    verifyIdToken.mockResolvedValueOnce({ ...verifiedIdentity, uid: 'firebase-auth-spec-uid-2' });
    await expect(auth.exchangeFirebaseToken('replacement-id-token')).rejects.toThrow(
      'An account already uses this email',
    );
  });

  it('refuses to adopt an existing row for an unverified address', async () => {
    await auth.exchangeFirebaseToken('firebase-id-token');
    verifyIdToken.mockResolvedValueOnce({
      ...verifiedIdentity,
      uid: 'firebase-auth-spec-uid-3',
      emailVerified: false,
    });
    await expect(auth.exchangeFirebaseToken('unverified-replacement')).rejects.toThrow(
      'Verify your email',
    );
    expect((await prisma.user.findUnique({ where: { email: TEST_EMAIL } }))?.firebaseUid).toBe(
      verifiedIdentity.uid,
    );
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

    // Creating/signing up as a client must override the role on an existing
    // dual-role account instead of dropping it back into the stylist UI.
    await auth.exchangeFirebaseToken('firebase-id-token', 'client');
    expect((await auth.me(id)).activeRole).toBe('client');

    // Conversely, Google sign-up as a provider must restore the provider side
    // when this Firebase identity already owns a stylist page.
    await auth.exchangeFirebaseToken('firebase-id-token', 'provider');
    expect((await auth.me(id)).activeRole).toBe('provider');
  });

  it('keeps a new provider selection on the client role until provider setup exists', async () => {
    const tokens = await auth.exchangeFirebaseToken('firebase-id-token', 'provider');
    const { id } = await auth.verifyAccessToken(tokens.accessToken);
    expect(await auth.me(id)).toMatchObject({
      activeRole: 'client',
      hasProviderProfile: false,
    });
  });
});
