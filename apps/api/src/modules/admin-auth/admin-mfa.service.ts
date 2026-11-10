import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminMfaSetup } from '@sc/shared';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password';
import { deriveKey, open, seal } from './secret-box';
import { base32Encode, generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

export const RECOVERY_CODE_COUNT = 10;

function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normaliseRecoveryCode(code)).digest('hex');
}

/** 10 characters of base32 (50 bits), shown as two groups of five. */
function generateRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/**
 * Authenticator-app two-factor sign-in for admin accounts: enrolment,
 * verification at sign-in (TOTP or a one-time recovery code), and removal.
 */
@Injectable()
export class AdminMfaService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.key = deriveKey(config.get('ADMIN_JWT_REFRESH_PEPPER', { infer: true }));
  }

  /** Step 1: a fresh secret, held as pending until a valid code confirms it. */
  async startEnrollment(adminId: string): Promise<AdminMfaSetup> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (admin.totpEnabledAt) {
      throw new BadRequestException('Two-factor sign-in is already on for this account');
    }
    const secret = generateTotpSecret();
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpPendingSecret: seal(secret, this.key) },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, admin.email) };
  }

  /** Step 2: the first valid code turns 2FA on and returns recovery codes, once. */
  async confirmEnrollment(adminId: string, code: string): Promise<string[]> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (admin.totpEnabledAt) {
      throw new BadRequestException('Two-factor sign-in is already on for this account');
    }
    if (!admin.totpPendingSecret) {
      throw new BadRequestException('Start two-factor setup first');
    }
    const step = verifyTotp(open(admin.totpPendingSecret, this.key), code, Date.now(), null);
    if (step === null) {
      throw new BadRequestException(
        "That code didn't match. Check your phone's clock and try again.",
      );
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: {
        totpSecret: admin.totpPendingSecret,
        totpPendingSecret: null,
        totpEnabledAt: new Date(),
        totpLastUsedStep: step,
        recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
      },
    });
    return recoveryCodes;
  }

  /**
   * True if `code` is a current authenticator code or an unused recovery
   * code. Both are consumed atomically (guarded updateMany), so two
   * concurrent requests can't both spend the same code.
   */
  async verifySignInCode(adminId: string, code: string): Promise<boolean> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin?.totpSecret) return false;

    const step = verifyTotp(
      open(admin.totpSecret, this.key),
      code,
      Date.now(),
      admin.totpLastUsedStep,
    );
    if (step !== null) {
      const { count } = await this.prisma.adminUser.updateMany({
        where: {
          id: adminId,
          OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
        },
        data: { totpLastUsedStep: step },
      });
      return count === 1;
    }

    const hash = hashRecoveryCode(code);
    if (!admin.recoveryCodeHashes.includes(hash)) return false;
    const { count } = await this.prisma.adminUser.updateMany({
      where: { id: adminId, recoveryCodeHashes: { has: hash } },
      data: { recoveryCodeHashes: admin.recoveryCodeHashes.filter((h) => h !== hash) },
    });
    return count === 1;
  }

  /** New recovery codes (old ones stop working); needs a current code. */
  async regenerateRecoveryCodes(adminId: string, code: string): Promise<string[]> {
    if (!(await this.verifySignInCode(adminId, code))) {
      throw new UnauthorizedException("That code didn't match");
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode) },
    });
    return recoveryCodes;
  }

  /** Turning it off yourself needs both your password and a current code. */
  async disable(adminId: string, password: string, code: string): Promise<void> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!admin.totpEnabledAt) return;
    if (!(await verifyPassword(password, admin.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }
    if (!(await this.verifySignInCode(adminId, code))) {
      throw new UnauthorizedException("That code didn't match");
    }
    await this.clear(adminId);
  }

  /**
   * Another admin clearing a colleague's 2FA (lost phone). Signs the account
   * out everywhere, so whoever holds its sessions has to sign in again.
   */
  async resetFor(targetAdminId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminRefreshToken.updateMany({
        where: { adminUserId: targetAdminId, revoked: false },
        data: { revoked: true },
      }),
      this.prisma.adminUser.update({
        where: { id: targetAdminId },
        data: { ...MFA_CLEARED, tokenVersion: { increment: 1 } },
      }),
    ]);
  }

  private async clear(adminId: string): Promise<void> {
    await this.prisma.adminUser.update({ where: { id: adminId }, data: MFA_CLEARED });
  }
}

export const MFA_CLEARED = {
  totpSecret: null,
  totpPendingSecret: null,
  totpEnabledAt: null,
  totpLastUsedStep: null,
  recoveryCodeHashes: [],
};
