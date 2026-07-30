import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateReportInput } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every M1 report target is a provider — `providerId` resolves to the real reportedId (a User id) here, so the client never needs to know it. */
  async create(reporterId: string, input: CreateReportInput): Promise<void> {
    const provider = await this.prisma.providerProfile.findUnique({ where: { id: input.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    await this.prisma.report.create({
      data: {
        reporterId,
        reportedId: provider.userId,
        reason: input.reason,
        ...(input.bookingId ? { bookingId: input.bookingId } : {}),
      },
    });
  }
}
