import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminIdentity, AdminSession } from '@sc/shared';
import { AdminMfaService } from './admin-mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminRole } from '../../generated/prisma';
import type { Env } from '../../config/env';
import { verifyPassword } from './password';

const ACCESS_TOKEN_TTL = '15m';
/** How long the password step stays good while the user fetches their phone. */
const MFA_CHALLENGE_TTL = '5m';
const REFRESH_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h — a staff shift, not a month.

interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Admin console auth (apps/admin). Email + password, not phone + OTP —
 * staff aren't clients or providers. The refresh-rotation-with-reuse-
 * detection scheme mirrors AuthService's exactly (see that file for the
 * reasoning); the tables and secrets are kept fully separate so an admin
 * session can never be forged from, or confused with, a user session.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly mfa: AdminMfaService,
  ) {}

  /**
   * Password step. Accounts without 2FA get a session straight away; accounts
   * with it get a short-lived challenge token to redeem at completeMfaLogin.
   */
  async login(email: string, password: string): Promise<LoginOutcome> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    // A uniform message regardless of which check failed — a login screen
    // that says "no such account" for a bad email but "wrong password" for a
    // bad password one hands an attacker a working email-enumeration oracle.
    // A disabled account fails the same way, for the same reason — it
    // shouldn't reveal that the email belongs to a (revoked) staff account.
    if (
      !admin ||
      admin.disabled ||
      admin.deletedAt ||
      !(await verifyPassword(password, admin.passwordHash))
    ) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    if (admin.totpEnabledAt) {
      const mfaToken = await this.jwt.signAsync(
        { sub: admin.id, ver: admin.tokenVersion },
        { secret: this.mfaChallengeSecret(), expiresIn: MFA_CHALLENGE_TTL },
      );
      return { kind: 'mfa', adminId: admin.id, mfaToken };
    }
    return { kind: 'session', ...(await this.startSession(admin)) };
  }

  /** Reads the challenge token without checking the code, so callers can rate-limit per account first. */
  async readMfaChallenge(mfaToken: string): Promise<{ adminId: string; ver: number }> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; ver: number }>(mfaToken, {
        secret: this.mfaChallengeSecret(),
      });
      return { adminId: payload.sub, ver: payload.ver };
    } catch {
      throw new UnauthorizedException('Sign-in timed out. Enter your password again.');
    }
  }

  /** Second step: the challenge token plus an authenticator or recovery code. */
  async completeMfaLogin(
    mfaToken: string,
    code: string,
  ): Promise<AdminSession & IssuedRefreshTokenWrapper> {
    const payload = await this.readMfaChallenge(mfaToken);
    const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.adminId } });
    if (
      !admin?.totpEnabledAt ||
      admin.disabled ||
      admin.deletedAt ||
      admin.tokenVersion !== payload.ver
    ) {
      throw new UnauthorizedException('Sign-in timed out. Enter your password again.');
    }
    if (!(await this.mfa.verifySignInCode(admin.id, code))) {
      throw new UnauthorizedException("That code didn't match");
    }
    return this.startSession(admin);
  }

  private async startSession(admin: AdminRow): Promise<AdminSession & IssuedRefreshTokenWrapper> {
    const accessToken = await this.signAccessToken(admin.id, admin.tokenVersion);
    const refreshToken = await this.issueRefreshToken(admin.id, randomUUID());
    return {
      accessToken,
      admin: this.toIdentity(admin),
      refreshToken: refreshToken.raw,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }

  /**
   * A different signing secret from access tokens, so a challenge token (which
   * only proves the password) can never be presented as a session.
   */
  private mfaChallengeSecret(): string {
    return `${this.config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true })}:mfa-challenge`;
  }

  toIdentity(admin: AdminRow): AdminIdentity {
    const mfaEnabled = admin.totpEnabledAt !== null;
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      role: admin.role,
      mfaEnabled,
      mfaSetupRequired: !mfaEnabled && this.config.get('ADMIN_MFA_REQUIRED', { infer: true }),
    };
  }

  /** Same reuse-detection shape as AuthService.refresh: a replayed token revokes its whole family. */
  async refresh(
    refreshTokenRaw: string,
  ): Promise<{ accessToken: string } & IssuedRefreshTokenWrapper> {
    const tokenHash = this.hashRefreshToken(refreshTokenRaw);
    const record = await this.prisma.adminRefreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revoked) {
      await this.prisma.adminRefreshToken.updateMany({
        where: { familyId: record.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: record.adminUserId },
    });

    await this.prisma.adminRefreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });

    const refreshToken = await this.issueRefreshToken(admin.id, record.familyId);
    const accessToken = await this.signAccessToken(admin.id, admin.tokenVersion);

    return {
      accessToken,
      refreshToken: refreshToken.raw,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }

  async logout(refreshTokenRaw: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshTokenRaw);
    await this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  async me(adminId: string): Promise<AdminIdentity> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    return this.toIdentity(admin);
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ id: string; mfaEnabled: boolean; role: AdminRole }> {
    let payload: { sub: string; ver: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; ver: number }>(token, {
        secret: this.config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Session no longer valid');
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin) {
      throw new UnauthorizedException('Session no longer valid');
    }
    if (admin.tokenVersion !== payload.ver || admin.disabled || admin.deletedAt) {
      throw new UnauthorizedException('Session no longer valid');
    }

    return { id: admin.id, mfaEnabled: admin.totpEnabledAt !== null, role: admin.role };
  }

  private async issueRefreshToken(
    adminUserId: string,
    familyId: string,
  ): Promise<IssuedRefreshToken> {
    const raw = generateRefreshTokenRaw();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.adminRefreshToken.create({
      data: {
        adminUserId,
        familyId,
        tokenHash: this.hashRefreshToken(raw),
        expiresAt,
      },
    });
    return { raw, expiresAt };
  }

  private signAccessToken(adminId: string, tokenVersion: number): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, ver: tokenVersion },
      {
        secret: this.config.get('ADMIN_JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
  }

  private hashRefreshToken(raw: string): string {
    return sha256Hex(raw + this.config.get('ADMIN_JWT_REFRESH_PEPPER', { infer: true }));
  }
}

interface IssuedRefreshTokenWrapper {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

interface AdminRow {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  tokenVersion: number;
  totpEnabledAt: Date | null;
}

export type LoginOutcome =
  | ({ kind: 'session' } & AdminSession & IssuedRefreshTokenWrapper)
  | { kind: 'mfa'; adminId: string; mfaToken: string };
