import { describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { FirebaseIdentityService } from '../auth/firebase-identity.service';
import type { UserLifecycleService } from '../auth/user-lifecycle.service';

describe('AdminUsersService account deletion', () => {
  it('disables Firebase before tombstoning Postgres, then deletes and unlinks the UID', async () => {
    const findUniqueOrThrow = vi.fn(() =>
      Promise.resolve({ id: 'user-id', firebaseUid: 'firebase-uid', email: 'user@example.com' }),
    );
    const resolveAccount = vi.fn(() =>
      Promise.resolve({ uid: 'firebase-uid', status: 'active' as const }),
    );
    const disableAccount = vi.fn(() => Promise.resolve());
    const deleteAccount = vi.fn(() => Promise.resolve());
    const tombstone = vi.fn(() => Promise.resolve({ firebaseUid: 'firebase-uid' }));
    const releaseFirebaseUid = vi.fn(() => Promise.resolve());
    const service = new AdminUsersService(
      { user: { findUniqueOrThrow } } as unknown as PrismaService,
      { resolveAccount, disableAccount, deleteAccount } as unknown as FirebaseIdentityService,
      { tombstone, releaseFirebaseUid } as unknown as UserLifecycleService,
    );

    await expect(service.remove('user-id')).resolves.toEqual({
      ok: true,
      firebaseDeleted: true,
    });
    expect(disableAccount).toHaveBeenCalledWith('firebase-uid');
    expect(tombstone).toHaveBeenCalledWith('user-id', false);
    expect(deleteAccount).toHaveBeenCalledWith('firebase-uid');
    expect(releaseFirebaseUid).toHaveBeenCalledWith('user-id');
    expect(disableAccount.mock.invocationCallOrder[0]).toBeLessThan(
      tombstone.mock.invocationCallOrder[0] ?? 0,
    );
    expect(tombstone.mock.invocationCallOrder[0]).toBeLessThan(
      deleteAccount.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('can finish tombstoning an already-unlinked database user', async () => {
    const tombstone = vi.fn(() => Promise.resolve({ firebaseUid: null }));
    const firebase = {
      resolveAccount: vi.fn(() => Promise.resolve(null)),
      disableAccount: vi.fn(),
      deleteAccount: vi.fn(),
    };
    const service = new AdminUsersService(
      {
        user: {
          findUniqueOrThrow: vi.fn(() =>
            Promise.resolve({ id: 'user-id', firebaseUid: null, email: null }),
          ),
        },
      } as unknown as PrismaService,
      firebase as unknown as FirebaseIdentityService,
      { tombstone, releaseFirebaseUid: vi.fn() } as unknown as UserLifecycleService,
    );

    await expect(service.remove('user-id')).resolves.toEqual({
      ok: true,
      firebaseDeleted: false,
    });
    expect(tombstone).toHaveBeenCalledWith('user-id', true);
    expect(firebase.disableAccount).not.toHaveBeenCalled();
    expect(firebase.deleteAccount).not.toHaveBeenCalled();
  });

  it('finds and deletes Firebase by email for a legacy row with no stored UID', async () => {
    const firebase = {
      resolveAccount: vi.fn(() =>
        Promise.resolve({ uid: 'legacy-firebase-uid', status: 'active' as const }),
      ),
      disableAccount: vi.fn(() => Promise.resolve()),
      deleteAccount: vi.fn(() => Promise.resolve()),
    };
    const lifecycle = {
      tombstone: vi.fn(() => Promise.resolve({ firebaseUid: null })),
      releaseFirebaseUid: vi.fn(() => Promise.resolve()),
    };
    const service = new AdminUsersService(
      {
        user: {
          update: vi.fn(() => Promise.resolve()),
          findUniqueOrThrow: vi.fn(() =>
            Promise.resolve({
              id: 'legacy-user-id',
              firebaseUid: null,
              email: 'legacy@example.com',
            }),
          ),
        },
      } as unknown as PrismaService,
      firebase as unknown as FirebaseIdentityService,
      lifecycle as unknown as UserLifecycleService,
    );

    await expect(service.remove('legacy-user-id')).resolves.toEqual({
      ok: true,
      firebaseDeleted: true,
    });
    expect(firebase.resolveAccount).toHaveBeenCalledWith(null, 'legacy@example.com');
    expect(lifecycle.tombstone).toHaveBeenCalledWith('legacy-user-id', false);
    expect(firebase.disableAccount).toHaveBeenCalledWith('legacy-firebase-uid');
    expect(firebase.deleteAccount).toHaveBeenCalledWith('legacy-firebase-uid');
    expect(lifecycle.releaseFirebaseUid).toHaveBeenCalledWith('legacy-user-id');
  });
});
