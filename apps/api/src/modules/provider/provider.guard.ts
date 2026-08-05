import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface ProviderRequest extends Request {
  user?: { id: string };
  /** The signed-in user's ProviderProfile id, resolved once here. */
  providerProfileId?: string;
}

/**
 * Runs after JwtAuthGuard and turns "a signed-in user" into "a stylist".
 *
 * Every provider route needs the caller's ProviderProfile id, and every one
 * of them must refuse a client account. Doing that here rather than in each
 * handler means a new endpoint cannot forget the check — which on this side
 * of the app would mean one stylist acting on another's bookings.
 */
@Injectable()
export class ProviderGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ProviderRequest>();
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException();

    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new ForbiddenException('This account does not have a stylist page');
    }

    req.providerProfileId = profile.id;
    return true;
  }
}
