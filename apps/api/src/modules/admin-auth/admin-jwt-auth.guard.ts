import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Env } from '../../config/env';
import { AdminAuthService } from './admin-auth.service';
import { ALLOW_WITHOUT_MFA } from './allow-without-mfa.decorator';

export interface AdminAuthenticatedRequest extends Request {
  admin?: { id: string; mfaEnabled: boolean };
}

/**
 * The admin-side twin of JwtAuthGuard — verifies against ADMIN_JWT_ACCESS_SECRET
 * via AdminAuthService rather than AuthService, so an admin token can never
 * authenticate a `/v1/*` user route or vice versa. Attaches `req.admin`,
 * which AuditInterceptor also reads (see audit.interceptor.ts).
 *
 * With ADMIN_MFA_REQUIRED on, an account that hasn't enrolled in 2FA is
 * refused everywhere except routes marked @AllowWithoutMfa().
 */
@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminAuthenticatedRequest>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    req.admin = await this.adminAuth.verifyAccessToken(token);

    if (
      this.config.get('ADMIN_MFA_REQUIRED', { infer: true }) &&
      !req.admin.mfaEnabled &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_MFA, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MFA_SETUP_REQUIRED',
        message: 'Set up two-factor sign-in on your account page to continue.',
      });
    }
    return true;
  }
}
