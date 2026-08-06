import { randomBytes, randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type Redis from 'ioredis';
import {
  isProfileComplete,
  normalizePhone,
  type ActiveRole,
  type AuthTokens,
  type Me,
  type RequestOtpResponse,
  type UpdateProfileInput,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { TrustService } from '../trust/trust.service';
import type { Env } from '../../config/env';

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const PHONE_RATE_LIMIT_PER_HOUR = 5;
const IP_RATE_LIMIT_PER_HOUR = 20;
const RATE_WINDOW_SECONDS = 3600;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface OtpChallenge {
  phone: string;
  codeHash: string;
  attempts: number;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateOtpCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Phone + OTP auth (plan §6). No email/password — the phone number IS the
 * identity. `AUTH_DEV_OTP` (env-validated to never exist in production, see
 * config/env.ts) makes every challenge's real code equal to that fixed
 * value, so dev/demo never needs a working SMS/WhatsApp provider (plan risk
 * R4) — the code is never actually "sent" anywhere in that mode, since dev
 * already knows it.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly trust: TrustService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async requestOtp(phoneInput: string, ip: string): Promise<RequestOtpResponse> {
    const phone = normalizePhone(phoneInput);
    if (!phone) {
      throw new BadRequestException('Invalid phone number');
    }

    await this.checkRateLimit(`otp:rate:phone:${phone}`, PHONE_RATE_LIMIT_PER_HOUR);
    await this.checkRateLimit(`otp:rate:ip:${ip}`, IP_RATE_LIMIT_PER_HOUR);

    const devOtp = this.config.get('AUTH_DEV_OTP', { infer: true });
    const code = devOtp ?? generateOtpCode();
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    const challenge: OtpChallenge = { phone, codeHash: sha256Hex(code), attempts: 0 };
    await this.redis.setex(
      `otp:challenge:${challengeId}`,
      OTP_TTL_SECONDS,
      JSON.stringify(challenge),
    );

    // Real SMS/WhatsApp delivery is a later milestone (plan risk R4) — in
    // dev, `code` already equals AUTH_DEV_OTP, so there's nothing to send.

    return { challengeId, expiresAt: expiresAt.toISOString() };
  }

  private async checkRateLimit(key: string, limit: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, RATE_WINDOW_SECONDS);
    }
    if (count > limit) {
      throw new HttpException('Too many requests — try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async verifyOtp(challengeId: string, code: string): Promise<AuthTokens> {
    const key = `otp:challenge:${challengeId}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException('Challenge expired or not found');
    }

    const challenge = JSON.parse(raw) as OtpChallenge;
    const devOtp = this.config.get('AUTH_DEV_OTP', { infer: true });
    const matches = (!!devOtp && code === devOtp) || sha256Hex(code) === challenge.codeHash;

    if (!matches) {
      challenge.attempts += 1;
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
        await this.redis.del(key);
        throw new UnauthorizedException('Too many incorrect attempts — request a new code');
      }
      await this.redis.setex(key, OTP_TTL_SECONDS, JSON.stringify(challenge));
      throw new UnauthorizedException('Incorrect code');
    }

    await this.redis.del(key);

    const user = await this.findOrCreateUser(challenge.phone);

    /**
     * Bumping `tokenVersion` kills a banned user's live sessions, but nothing
     * stopped them signing in again a second later — the ban would have been
     * a speed bump. The message carries the stated reason, because a user who
     * cannot tell why they were removed cannot appeal.
     */
    const ban = await this.trust.findActiveBan(user.id);
    if (ban) {
      throw new ForbiddenException(`Your account has been removed: ${ban.reason}`);
    }

    return this.issueTokens(user.id, user.tokenVersion);
  }

  private async findOrCreateUser(phone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) return existing;

    const city = await this.prisma.city.findFirstOrThrow();
    return this.prisma.user.create({
      data: { phone, displayName: phone, cityId: city.id },
    });
  }

  private async issueTokens(userId: string, tokenVersion: number): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(userId, tokenVersion);

    const refreshTokenRaw = generateRefreshTokenRaw();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: randomUUID(),
        tokenHash: this.hashRefreshToken(refreshTokenRaw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken: refreshTokenRaw };
  }

  private signAccessToken(userId: string, tokenVersion: number): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, ver: tokenVersion },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
  }

  private hashRefreshToken(raw: string): string {
    return sha256Hex(raw + this.config.get('JWT_REFRESH_PEPPER', { infer: true }));
  }

  /**
   * Rotates on every use; a replayed (already-rotated) token revokes its
   * whole family rather than just failing quietly — the plan's explicit
   * reuse-detection requirement (§6). Rows are marked `revoked`, never
   * deleted, so a replay can still be recognised as "known but stale"
   * instead of indistinguishable from "never existed".
   */
  async refresh(refreshTokenRaw: string): Promise<AuthTokens> {
    const tokenHash = this.hashRefreshToken(refreshTokenRaw);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revoked) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });

    const refreshTokenRawNew = generateRefreshTokenRaw();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: record.familyId,
        tokenHash: this.hashRefreshToken(refreshTokenRawNew),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    const accessToken = await this.signAccessToken(user.id, user.tokenVersion);
    return { accessToken, refreshToken: refreshTokenRawNew };
  }

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { providerProfile: true },
    });

    return {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      activeRole: user.activeRole,
      hasProviderProfile: !!user.providerProfile,
      verificationStatus: user.verificationStatus,
      profileComplete: isProfileComplete(user.displayName, user.phone),
    };
  }

  /** `PATCH /v1/me` — replaces the sign-up placeholder `displayName` with a real one. */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Me> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { displayName: input.displayName },
    });
    return this.me(userId);
  }

  async setActiveRole(userId: string, role: ActiveRole): Promise<Me> {
    if (role === 'provider') {
      // The mobile client already hides the switch when there is no provider
      // page, but that is a UI convenience, not a boundary — this is the one
      // that actually matters. Every real /v1/provider/* route is separately
      // guarded by ProviderGuard, so setting the role alone could not act on
      // anyone else's behalf; without this check it would only mislabel the
      // account as a stylist it isn't, which is worth refusing outright.
      const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
      if (!profile) {
        throw new BadRequestException('This account does not have a stylist page yet');
      }
    }

    await this.prisma.user.update({ where: { id: userId }, data: { activeRole: role } });
    return this.me(userId);
  }

  /**
   * `ver` in the token must match the user's live `tokenVersion` — bumping
   * that column (a ban) invalidates every already-issued access token
   * instantly, without a per-request revocation-list lookup.
   */
  async verifyAccessToken(token: string): Promise<{ id: string }> {
    let payload: { sub: string; ver: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; ver: number }>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      /**
       * jsonwebtoken throws TokenExpiredError/JsonWebTokenError, neither of
       * which is an HttpException — so an expired or malformed token used to
       * surface as a 500. That is not just a wrong status code: the mobile
       * client only runs its refresh-and-retry on a 401, so every expired
       * session failed permanently instead of silently refreshing.
       */
      throw new UnauthorizedException('Session no longer valid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (user?.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Session no longer valid');
    }

    return { id: user.id };
  }
}
