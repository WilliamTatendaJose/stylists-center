import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { CurrentAdmin } from './current-admin.decorator';
import { AdminLoginDto } from './dto';
import { clearAdminRefreshCookie, readAdminRefreshCookie, setAdminRefreshCookie } from './cookies';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.adminAuth.login(dto.email, dto.password);
    setAdminRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt, this.isSecure());
    return { accessToken: result.accessToken, admin: result.admin };
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
  me(@CurrentAdmin() admin: { id: string }) {
    return this.adminAuth.me(admin.id);
  }

  private isSecure(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}
