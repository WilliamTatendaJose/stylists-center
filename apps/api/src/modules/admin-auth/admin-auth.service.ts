import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminIdentity, AdminSession } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';
import { verifyPassword } from './password';

const ACCESS_TOKEN_TTL = '15m';
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
  ) {}

  async login(email: string, password: string): Promise<AdminSession & IssuedRefreshTokenWrapper> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    // A uniform message regardless of which check failed — a login screen
    // that says "no such account" for a bad email but "wrong password" for a
    // bad password one hands an attacker a working email-enumeration oracle.
    // A disabled account fails the same way, for the same reason — it
    // shouldn't reveal that the email belongs to a (revoked) staff account.
    if (!admin || admin.disabled || !(await verifyPassword(password, admin.passwordHash))) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    const accessToken = await this.signAccessToken(admin.id, admin.tokenVersion);
    const refreshToken = await this.issueRefreshToken(admin.id, randomUUID());

    return {
      accessToken,
      admin: toIdentity(admin),
      refreshToken: refreshToken.raw,
      refreshTokenExpiresAt: refreshToken.expiresAt,
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
    return toIdentity(admin);
  }

  async verifyAccessToken(token: string): Promise<{ id: string }> {
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
    if (admin.tokenVersion !== payload.ver || admin.disabled) {
      throw new UnauthorizedException('Session no longer valid');
    }

    return { id: admin.id };
  }

  private async issueRefreshToken(adminUserId: string, familyId: string): Promise<IssuedRefreshToken> {
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

function toIdentity(admin: { id: string; email: string; displayName: string }): AdminIdentity {
  return { id: admin.id, email: admin.email, displayName: admin.displayName };
}
