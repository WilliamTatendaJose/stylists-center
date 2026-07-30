import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** Only valid behind `@UseGuards(JwtAuthGuard)`, which is what actually populates `req.user`. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): { id: string } => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.user) {
    throw new UnauthorizedException();
  }
  return req.user;
});
