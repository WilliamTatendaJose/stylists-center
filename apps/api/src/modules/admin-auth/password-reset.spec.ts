import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env';
import type { FirebaseIdentity, FirebaseIdentityService } from '../auth/firebase-identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AdminMfaService } from './admin-mfa.service';
import { AdminAuthService, PASSWORD_RESET_PROOF_MAX_AGE_MS } from './admin-auth.service';
import { verifyPassword } from './password';

const NOW = new Date('2026-11-24T10:00:00Z');

interface Row {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'finance' | 'support';
  passwordHash: string;
  tokenVersion: number;
  totpEnabledAt: Date | null;
  disabled: boolean;
  deletedAt: Date | null;
}

function setup(opts: {
  identity?: Partial<FirebaseIdentity>;
  admin?: Partial<Row> | null;
  codeOk?: boolean;
}) {
  const row: Row | null =
    opts.admin === null
      ? null
      : {
          id: 'admin-1',
          email: 'Owner@Example.com',
          displayName: 'Owner',
          role: 'owner',
          passwordHash: 'old:hash',
          tokenVersion: 3,
          totpEnabledAt: null,
          disabled: false,
          deletedAt: null,
          ...opts.admin,
        };
  const revoked: string[] = [];
  const codesChecked: string[] = [];
  const prisma = {
    adminUser: {
      findFirst: ({ where }: { where: { email: { equals: string; mode: string } } }) =>
        Promise.resolve(row?.email.toLowerCase() === where.email.equals.toLowerCase() ? row : null),
      update: ({
        data,
      }: {
        data: { passwordHash: string; tokenVersion: { increment: number } };
      }) => {
        if (!row) throw new Error('no admin');
        row.passwordHash = data.passwordHash;
        row.tokenVersion += data.tokenVersion.increment;
        return Promise.resolve(row);
      },
    },
    adminRefreshToken: {
      updateMany: ({ where }: { where: { adminUserId: string } }) => {
        revoked.push(where.adminUserId);
        return Promise.resolve({ count: 2 });
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const firebase = {
    verifyIdToken: (token: string) => {
      if (token !== 'good-token') return Promise.reject(new UnauthorizedException('bad token'));
      return Promise.resolve({
        uid: 'fb-1',
        email: 'owner@example.com',
        emailVerified: true,
        displayName: null,
        photoUrl: null,
        phoneNumber: null,
        authTime: new Date(NOW.getTime() - 60_000),
        ...opts.identity,
      } satisfies FirebaseIdentity);
    },
  };
  const mfa = {
    verifySignInCode: (_id: string, code: string) => {
      codesChecked.push(code);
      return Promise.resolve(opts.codeOk ?? false);
    },
  };
  const config = { get: () => false };
  const service = new AdminAuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    config as unknown as ConfigService<Env, true>,
    mfa as unknown as AdminMfaService,
    firebase as unknown as FirebaseIdentityService,
  );
  return { service, row, revoked, codesChecked };
}

describe('admin password reset with a Firebase email-link proof', () => {
  it('finds the staff account for a fresh, verified proof, ignoring email case', async () => {
    const { service } = setup({});
    const admin = await service.resolvePasswordResetAccount('good-token', NOW);
    expect(admin.id).toBe('admin-1');
  });

  it('rejects a token Firebase does not accept', async () => {
    const { service } = setup({});
    await expect(service.resolvePasswordResetAccount('forged', NOW)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an email Firebase has not verified', async () => {
    const { service } = setup({ identity: { emailVerified: false } });
    await expect(service.resolvePasswordResetAccount('good-token', NOW)).rejects.toThrow(
      /did not confirm/,
    );
  });

  it('rejects a sign-in older than the proof window', async () => {
    const { service } = setup({
      identity: { authTime: new Date(NOW.getTime() - PASSWORD_RESET_PROOF_MAX_AGE_MS - 1000) },
    });
    await expect(service.resolvePasswordResetAccount('good-token', NOW)).rejects.toThrow(/expired/);
  });

  it.each([
    ['no staff account', null],
    ['a disabled account', { disabled: true }],
    ['a deleted account', { deletedAt: new Date() }],
  ] as const)('rejects %s', async (_label, admin) => {
    const { service } = setup({ admin });
    await expect(service.resolvePasswordResetAccount('good-token', NOW)).rejects.toThrow(
      /no active staff account/,
    );
  });

  it('sets the new password and ends every session', async () => {
    const { service, row, revoked } = setup({});
    const admin = await service.resolvePasswordResetAccount('good-token', NOW);
    await service.resetPassword(admin, 'a-brand-new-password', undefined);
    expect(row && (await verifyPassword('a-brand-new-password', row.passwordHash))).toBe(true);
    expect(row?.tokenVersion).toBe(4);
    expect(revoked).toEqual(['admin-1']);
  });

  it('requires a 2FA code when the account has 2FA, and changes nothing without one', async () => {
    const { service, row, revoked } = setup({ admin: { totpEnabledAt: new Date() } });
    const admin = await service.resolvePasswordResetAccount('good-token', NOW);
    await expect(service.resetPassword(admin, 'a-brand-new-password', undefined)).rejects.toThrow(
      /two-factor/,
    );
    expect(row?.passwordHash).toBe('old:hash');
    expect(revoked).toEqual([]);
  });

  it('refuses a wrong 2FA code', async () => {
    const { service, row } = setup({ admin: { totpEnabledAt: new Date() }, codeOk: false });
    const admin = await service.resolvePasswordResetAccount('good-token', NOW);
    await expect(service.resetPassword(admin, 'a-brand-new-password', '000000')).rejects.toThrow(
      /didn't match/,
    );
    expect(row?.passwordHash).toBe('old:hash');
  });

  it('accepts a correct 2FA code', async () => {
    const { service, row, codesChecked } = setup({
      admin: { totpEnabledAt: new Date() },
      codeOk: true,
    });
    const admin = await service.resolvePasswordResetAccount('good-token', NOW);
    await service.resetPassword(admin, 'a-brand-new-password', '123456');
    expect(codesChecked).toEqual(['123456']);
    expect(row && (await verifyPassword('a-brand-new-password', row.passwordHash))).toBe(true);
  });
});
