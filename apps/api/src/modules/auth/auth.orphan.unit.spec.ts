import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { FirebaseIdentityService } from './firebase-identity.service';
import type { UserLifecycleService } from './user-lifecycle.service';
import type { TrustService } from '../trust/trust.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

const identity = {
  uid: 'new-firebase-uid',
  email: 'same@example.com',
  emailVerified: true,
  displayName: 'Fresh Signup',
  photoUrl: null,
  phoneNumber: null,
};

function buildAuth(
  oldFirebaseStatus: 'active' | 'disabled' | 'missing',
  oldFirebaseUid: string | null = 'old-firebase-uid',
) {
  const oldUser = {
    id: 'old-app-user',
    firebaseUid: oldFirebaseUid,
    email: identity.email,
    disabledAt: null,
    deletedAt: null,
    activeRole: 'provider',
    tokenVersion: 4,
  };
  const newUser = {
    id: 'new-app-user',
    firebaseUid: identity.uid,
    email: identity.email,
    activeRole: 'client',
    tokenVersion: 0,
  };
  const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(oldUser);
  const create = vi.fn(() => Promise.resolve(newUser));
  const tombstone = vi.fn(() => Promise.resolve({ firebaseUid: oldUser.firebaseUid }));
  const prisma = {
    user: { findUnique, create },
    city: { findFirst: vi.fn(() => Promise.resolve({ id: 'city-id' })) },
    refreshToken: { create: vi.fn(() => Promise.resolve({})) },
  } as unknown as PrismaService;
  const firebase = {
    verifyIdToken: vi.fn(() => Promise.resolve(identity)),
    getAccountStatus: vi.fn(() => Promise.resolve(oldFirebaseStatus)),
  } as unknown as FirebaseIdentityService;
  const auth = new AuthService(
    prisma,
    { signAsync: vi.fn(() => Promise.resolve('app-access-token')) } as unknown as JwtService,
    {
      get: vi.fn((key: string) => (key === 'JWT_ACCESS_SECRET' ? 'a'.repeat(32) : 'b'.repeat(32))),
    } as unknown as ConfigService<Env, true>,
    { findActiveBan: vi.fn(() => Promise.resolve(null)) } as unknown as TrustService,
    firebase,
    { tombstone } as unknown as UserLifecycleService,
  );
  return { auth, create, tombstone };
}

describe('AuthService orphaned Firebase identity reconciliation', () => {
  it('tombstones the stale app identity and creates a fresh client account', async () => {
    const { auth, create, tombstone } = buildAuth('missing');

    await expect(auth.exchangeFirebaseToken('id-token')).resolves.toMatchObject({
      accessToken: 'app-access-token',
    });
    expect(tombstone).toHaveBeenCalledWith('old-app-user', true);
    expect(create).toHaveBeenCalledWith({
      data: {
        firebaseUid: identity.uid,
        email: identity.email,
        phone: null,
        displayName: identity.displayName,
        avatarImageUrl: null,
        cityId: 'city-id',
      },
    });
  });

  it('never adopts a different Firebase UID while the old identity still exists', async () => {
    const { auth, create, tombstone } = buildAuth('active');

    await expect(auth.exchangeFirebaseToken('id-token')).rejects.toThrow(
      'An account already uses this email',
    );
    expect(tombstone).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('archives an unlinked legacy row instead of inheriting its old role', async () => {
    const { auth, create, tombstone } = buildAuth('active', null);

    await expect(auth.exchangeFirebaseToken('id-token')).resolves.toMatchObject({
      accessToken: 'app-access-token',
    });
    expect(tombstone).toHaveBeenCalledWith('old-app-user', true);
    expect(create).toHaveBeenCalled();
  });
});
