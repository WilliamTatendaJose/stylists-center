import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateReportInput } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrustService } from '../trust/trust.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustService,
  ) {}

  /** Every M1 report target is a provider — `providerId` resolves to the real reportedId (a User id) here, so the client never needs to know it. */
  async create(reporterId: string, input: CreateReportInput): Promise<void> {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: input.providerId },
    });
    if (!provider) throw new NotFoundException('Provider not found');

    await this.prisma.report.create({
      data: {
        reporterId,
        reportedId: provider.userId,
        reason: input.reason,
        ...(input.bookingId ? { bookingId: input.bookingId } : {}),
      },
    });

    /**
     * A no-show is the one report reason that is a counted fact rather than a
     * judgement (trust.ts), so it feeds account standing directly instead of
     * waiting for admin review.
     *
     * Requires a booking: "they didn't show up" only means something about a
     * specific appointment, and without one there is nothing to attribute,
     * nothing to dedupe against, and nothing for an appeal to examine.
     */
    if (input.reason === 'no_show' && input.bookingId) {
      await this.trust.recordStrike(provider.userId, input.bookingId, 'no_show');
    }
  }
}
