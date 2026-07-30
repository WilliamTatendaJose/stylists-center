import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

/**
 * The only way a route becomes auth-required: `@UseGuards(JwtAuthGuard)`.
 * Attaches `req.user`, which AuditInterceptor already reads (it predates
 * this guard, deliberately — see audit.interceptor.ts).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    req.user = await this.authService.verifyAccessToken(token);
    return true;
  }
}
