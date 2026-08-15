import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AdminAuthenticatedRequest } from './admin-jwt-auth.guard';

/** Only valid behind `@UseGuards(AdminJwtAuthGuard)`, which is what actually populates `req.admin`. */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): { id: string } => {
    const req = ctx.switchToHttp().getRequest<AdminAuthenticatedRequest>();
    if (!req.admin) {
      throw new UnauthorizedException();
    }
    return req.admin;
  },
);
