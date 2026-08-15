import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';

export interface AdminAuthenticatedRequest extends Request {
  admin?: { id: string };
}

/**
 * The admin-side twin of JwtAuthGuard — verifies against ADMIN_JWT_ACCESS_SECRET
 * via AdminAuthService rather than AuthService, so an admin token can never
 * authenticate a `/v1/*` user route or vice versa. Attaches `req.admin`,
 * which AuditInterceptor also reads (see audit.interceptor.ts).
 */
@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminAuthenticatedRequest>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    req.admin = await this.adminAuth.verifyAccessToken(token);
    return true;
  }
}
