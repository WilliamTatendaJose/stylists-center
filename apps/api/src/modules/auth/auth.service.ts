import { randomBytes, randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  deriveInitials,
  deriveTint,
  isProfileComplete,
  type ActiveRole,
  type AuthTokens,
  type Me,
  type RegisterPushTokenInput,
  type UpdateProfileInput,
  type VerificationDto,
  type VerificationSubmissionInput,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrustService } from '../trust/trust.service';
import type { Env } from '../../config/env';
import { FirebaseIdentityService, type FirebaseIdentity } from './firebase-identity.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString('base64url');
}

/** Firebase proves identity; this service keeps app sessions and authorization. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly trust: TrustService,
    private readonly firebaseIdentity: FirebaseIdentityService,
  ) {}

  async exchangeFirebaseToken(idToken: string): Promise<AuthTokens> {
    const identity = await this.firebaseIdentity.verifyIdToken(idToken);
    if (!identity.email || !identity.emailVerified) {
      throw new UnauthorizedException('Verify your email before continuing');
    }

    const user = await this.findOrCreateFirebaseUser(identity);
    const ban = await this.trust.findActiveBan(user.id);
    if (ban) {
      throw new ForbiddenException(`Your account has been removed: ${ban.reason}`);
    }

    return this.issueTokens(user.id, user.tokenVersion);
  }

  private async findOrCreateFirebaseUser(identity: FirebaseIdentity) {
    if (!identity.email) {
      throw new UnauthorizedException('Firebase account does not have an email address');
    }
    const email = identity.email.trim().toLowerCase();
    let firebaseDisplayName = identity.displayName?.trim();
    if (firebaseDisplayName === '') firebaseDisplayName = undefined;
    firebaseDisplayName ??= email;
    const byUid = await this.prisma.user.findUnique({ where: { firebaseUid: identity.uid } });
    if (byUid) return byUid;

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (byEmail.firebaseUid && byEmail.firebaseUid !== identity.uid) {
        throw new UnauthorizedException('This email is linked to another sign-in');
      }
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { firebaseUid: identity.uid },
      });
    }

    const city = await this.resolveDefaultCity();
    return this.prisma.user.create({
      data: {
        firebaseUid: identity.uid,
        email,
        phone: identity.phoneNumber,
        displayName: firebaseDisplayName,
        avatarImageUrl: identity.photoUrl,
        cityId: city.id,
      },
    });
  }

  /**
   * `User.cityId` is required, so a sign-up cannot complete without some city
   * to point at. Cities are only ever inserted by `prisma/seed.ts` — the full
   * demo seed that RAILWAY.md explicitly tells you *not* to run in production
   * — while `seed:admin`, the one production is told to run, creates none. On
   * a correctly-provisioned deployment the table is therefore empty, and
   * `findFirstOrThrow` turned that into a Prisma error escaping as a 500 on
   * every genuinely-new account: sign-up worked for nobody, with a message
   * that pointed at nothing.
   *
   * Seeding a placeholder is the recoverable failure mode. An admin can rename
   * it and fix the centroid from the catalog console; the alternative strands
   * every new user until someone thinks to seed a table by hand.
   */
  private async resolveDefaultCity(): Promise<{ id: string }> {
    const existing = await this.prisma.city.findFirst({ select: { id: true } });
    if (existing) return existing;

    return this.prisma.city.create({
      data: {
        name: 'Harare',
        timezone: 'Africa/Harare',
        centroidLat: -17.8252,
        centroidLng: 31.0335,
        bboxWest: 30.9,
        bboxSouth: -17.95,
        bboxEast: 31.2,
        bboxNorth: -17.7,
      },
      select: { id: true },
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
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      avatarImageUrl: user.avatarImageUrl,
      activeRole: user.activeRole,
      hasProviderProfile: !!user.providerProfile,
      verificationStatus: user.verificationStatus,
      profileComplete: isProfileComplete(user.displayName, user.email ?? user.phone ?? ''),
    };
  }

  /** `PATCH /v1/me` — replaces the sign-up placeholder `displayName` with a real one. */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Me> {
    const provider = await this.prisma.providerProfile.findUnique({ where: { userId } });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          displayName: input.displayName,
          ...(input.avatarImageUrl !== undefined ? { avatarImageUrl: input.avatarImageUrl } : {}),
        },
      }),
      ...(provider
        ? [
            this.prisma.providerProfile.update({
              where: { id: provider.id },
              data: {
                displayName: input.displayName,
                tint: deriveTint(input.displayName),
                initials: deriveInitials(input.displayName),
              },
            }),
          ]
        : []),
      this.prisma.referral.updateMany({
        where: { referredUserId: userId },
        data: { referredName: input.displayName },
      }),
    ]);
    return this.me(userId);
  }

  /** Upsert keeps a rotated Expo token current without accumulating dead rows. */
  async registerPushToken(userId: string, input: RegisterPushTokenInput): Promise<void> {
    await this.prisma.devicePushToken.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: {
        userId,
        expoPushToken: input.expoPushToken,
        platform: input.platform,
      },
      update: {
        userId,
        platform: input.platform,
      },
    });
  }

  async getVerification(userId: string): Promise<VerificationDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        verificationStatus: true,
        verificationIdDocumentUrl: true,
        verificationSelfieImageUrl: true,
        verificationNote: true,
        verificationSubmittedAt: true,
      },
    });
    return {
      status: user.verificationStatus,
      idDocumentUrl: user.verificationIdDocumentUrl,
      selfieImageUrl: user.verificationSelfieImageUrl,
      note: user.verificationNote,
      submittedAt: user.verificationSubmittedAt?.toISOString() ?? null,
    };
  }

  async submitVerification(
    userId: string,
    input: VerificationSubmissionInput,
  ): Promise<VerificationDto> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { verificationStatus: true },
      });
      if (user.verificationStatus === 'verified') {
        throw new BadRequestException('Your identity is already verified');
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          verificationStatus: 'pending',
          verificationIdDocumentUrl: input.idDocumentUrl,
          verificationSelfieImageUrl: input.selfieImageUrl,
          verificationNote: null,
          verificationSubmittedAt: new Date(),
        },
      });
      await tx.agent.updateMany({
        where: { userId },
        data: { verificationStatus: 'pending' },
      });
    });
    return this.getVerification(userId);
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
