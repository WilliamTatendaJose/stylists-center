import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ProviderRequest } from './provider.guard';

/** The ProviderProfile id ProviderGuard resolved for this request. */
export const CurrentProvider = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<ProviderRequest>();
  return req.providerProfileId ?? '';
});
