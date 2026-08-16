import { Injectable } from '@nestjs/common';
import type { AdminOverviewDto, AdminOverviewTrendPointDto } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

const TREND_DAYS = 14;

@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AdminOverviewDto> {
    const [openReports, reviewingReports, activeBans, pendingVerification, totalProviders] =
      await Promise.all([
        this.prisma.report.count({ where: { status: 'open' } }),
        this.prisma.report.count({ where: { status: 'reviewing' } }),
        this.prisma.ban.count({ where: { appealStatus: { not: 'overturned' } } }),
        this.prisma.user.count({
          where: {
            verificationStatus: 'pending',
            verificationSubmittedAt: { not: null },
          },
        }),
        this.prisma.providerProfile.count(),
      ]);

    return { openReports, reviewingReports, activeBans, pendingVerification, totalProviders };
  }

  /**
   * Bucketed by the day each event happened (booking created / payment
   * released), zero-filled for empty days — a trend line, not the current
   * escrow snapshot Payments' overview() computes. Each 'released' row is a
   * single point-in-time event in the append-only ledger, so summing it by
   * its own day never double-counts the way a "current state" query would.
   */
  async trends(): Promise<AdminOverviewTrendPointDto[]> {
    const [bookingRows, releasedRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
        FROM "Booking"
        WHERE "createdAt" >= now() - interval '14 days'
        GROUP BY day
      `,
      this.prisma.$queryRaw<{ day: Date; released: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               coalesce(sum("amountUsdCents" - "feeUsdCents"), 0)::bigint AS released
        FROM "Payment"
        WHERE status = 'released'
          AND ("bookingId" IS NOT NULL OR "orderId" IS NOT NULL)
          AND "createdAt" >= now() - interval '14 days'
        GROUP BY day
      `,
    ]);

    const bookingsByDay = new Map(bookingRows.map((r) => [toDateKey(r.day), Number(r.count)]));
    const releasedByDay = new Map(releasedRows.map((r) => [toDateKey(r.day), Number(r.released)]));

    const points: AdminOverviewTrendPointDto[] = [];
    const today = new Date();
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - i);
      const key = toDateKey(day);
      points.push({
        date: key,
        bookingsCount: bookingsByDay.get(key) ?? 0,
        releasedUsdCents: releasedByDay.get(key) ?? 0,
      });
    }
    return points;
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
