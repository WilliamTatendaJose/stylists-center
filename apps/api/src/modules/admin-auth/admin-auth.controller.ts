import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { CurrentAdmin } from './current-admin.decorator';
import {
  AdminChangePasswordDto,
  AdminLoginDto,
  AdminMfaCodeDto,
  AdminMfaDisableDto,
  AdminMfaEnableDto,
  AdminMfaLoginDto,
  AdminPasswordResetDto,
} from './dto';
import { AdminMfaService } from './admin-mfa.service';
import { AllowWithoutMfa } from './allow-without-mfa.decorator';
import { LoginAttemptsService } from './login-attempts.service';
import { clearAdminRefreshCookie, readAdminRefreshCookie, setAdminRefreshCookie } from './cookies';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly attempts: LoginAttemptsService,
    private readonly mfa: AdminMfaService,
  ) {}

  // 10 tries a minute per client IP (the global floor is 120), on top of the
  // per-account lockout in LoginAttemptsService.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: Response) {
    await this.attempts.assertNotLocked(dto.email);
    let result: Awaited<ReturnType<AdminAuthService['login']>>;
    try {
      result = await this.adminAuth.login(dto.email, dto.password);
    } catch (error) {
      if (error instanceof UnauthorizedException) await this.attempts.recordFailure(dto.email);
      throw error;
    }
    await this.attempts.clear(dto.email);
    if (result.kind === 'mfa') {
      return { mfaRequired: true as const, mfaToken: result.mfaToken };
    }
    setAdminRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt, this.isSecure());
    return { accessToken: result.accessToken, admin: result.admin };
  }

  /**
   * Second sign-in step for accounts with 2FA. Same per-IP limit as login,
   * and its own per-account lockout: a 6-digit code is guessable in ~10^6
   * tries, so 5 wrong codes lock the account's code entry for 15 minutes.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(@Body() dto: AdminMfaLoginDto, @Res({ passthrough: true }) res: Response) {
    const { adminId } = await this.adminAuth.readMfaChallenge(dto.mfaToken);
    const lockKey = `mfa:${adminId}`;
    await this.attempts.assertNotLocked(lockKey);
    let result: Awaited<ReturnType<AdminAuthService['completeMfaLogin']>>;
    try {
      result = await this.adminAuth.completeMfaLogin(dto.mfaToken, dto.code);
    } catch (error) {
      if (error instanceof UnauthorizedException) await this.attempts.recordFailure(lockKey);
      throw error;
    }
    await this.attempts.clear(lockKey);
    setAdminRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt, this.isSecure());
    return { accessToken: result.accessToken, admin: result.admin };
  }

  /** 5 tries a minute per IP; wrong current passwords also count toward a per-account lockout. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password')
  @HttpCode(200)
  @UseGuards(AdminJwtAuthGuard)
  @AllowWithoutMfa()
  async changePassword(
    @CurrentAdmin() admin: { id: string },
    @Body() dto: AdminChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lockKey = `password:${admin.id}`;
    await this.attempts.assertNotLocked(lockKey);
    let result: Awaited<ReturnType<AdminAuthService['changePassword']>>;
    try {
      result = await this.adminAuth.changePassword(admin.id, dto.currentPassword, dto.newPassword);
    } catch (error) {
      if (error instanceof UnauthorizedException) await this.attempts.recordFailure(lockKey);
      throw error;
    }
    await this.attempts.clear(lockKey);
    setAdminRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt, this.isSecure());
    return { accessToken: result.accessToken, admin: result.admin };
  }

  /**
   * "Forgot password", unauthenticated. The body carries a Firebase ID token
   * from an email sign-in link sent to the account's address (see
   * AdminAuthService.resolvePasswordResetAccount). 5 tries a minute per IP;
   * wrong 2FA codes count toward the same per-account lockout as sign-in.
   * On success the sign-in lockout for the email is cleared too, so a person
   * who locked themselves out can sign in straight away.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: AdminPasswordResetDto,
    @Req() req: Request & { admin?: { id: string } },
  ) {
    const admin = await this.adminAuth.resolvePasswordResetAccount(dto.idToken);
    const lockKey = `mfa:${admin.id}`;
    if (admin.totpEnabledAt) await this.attempts.assertNotLocked(lockKey);
    try {
      await this.adminAuth.resetPassword(admin, dto.newPassword, dto.code);
    } catch (error) {
      if (error instanceof UnauthorizedException && admin.totpEnabledAt && dto.code) {
        await this.attempts.recordFailure(lockKey);
      }
      throw error;
    }
    if (admin.totpEnabledAt) await this.attempts.clear(lockKey);
    await this.attempts.clear(admin.email);
    // Lets the audit interceptor record whose password was reset.
    req.admin = { id: admin.id };
    return { ok: true };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @UseGuards(AdminJwtAuthGuard)
  @AllowWithoutMfa()
  setupMfa(@CurrentAdmin() admin: { id: string }) {
    return this.mfa.startEnrollment(admin.id);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @UseGuards(AdminJwtAuthGuard)
  @AllowWithoutMfa()
  async enableMfa(@CurrentAdmin() admin: { id: string }, @Body() dto: AdminMfaEnableDto) {
    return { recoveryCodes: await this.mfa.confirmEnrollment(admin.id, dto.code) };
  }

  @Post('mfa/recovery-codes')
  @HttpCode(200)
  @UseGuards(AdminJwtAuthGuard)
  async regenerateRecoveryCodes(
    @CurrentAdmin() admin: { id: string },
    @Body() dto: AdminMfaCodeDto,
  ) {
    return { recoveryCodes: await this.mfa.regenerateRecoveryCodes(admin.id, dto.code) };
  }

  @Post('mfa/disable')
  @HttpCode(200)
  @UseGuards(AdminJwtAuthGuard)
  async disableMfa(@CurrentAdmin() admin: { id: string }, @Body() dto: AdminMfaDisableDto) {
    await this.mfa.disable(admin.id, dto.password, dto.code);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readAdminRefreshCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('No session to refresh');
    }

    const result = await this.adminAuth.refresh(refreshToken);
    setAdminRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt, this.isSecure());
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readAdminRefreshCookie(req);
    if (refreshToken) {
      await this.adminAuth.logout(refreshToken);
    }
    clearAdminRefreshCookie(res, this.isSecure());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @AllowWithoutMfa()
  me(@CurrentAdmin() admin: { id: string }) {
    return this.adminAuth.me(admin.id);
  }

  private isSecure(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}
