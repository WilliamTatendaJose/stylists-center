import { Injectable, Logger } from '@nestjs/common';
import { NO_SHOW_COUNT_FOR_AUTO_BAN, triggersAutoBan } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Why a strike was recorded. Both count toward standing; an appeal needs to know which. */
export type StrikeReason = 'no_show' | 'late_cancellation';

const STRIKE_LABELS: Record<StrikeReason, string> = {
  no_show: 'not turning up to a booking',
  late_cancellation: 'cancelling a booking at short notice',
};

/**
 * Account standing: strikes, and the automatic ban they add up to.
 *
 * The policy was written down in @sc/shared's trust.ts and modelled in the
 * schema — `NoShowRecord`, `Ban`, `triggersAutoBan()`, and the `tokenVersion`
 * column documented as the ban lever — but nothing ever wrote or read any of
 * it. The Bookings screen has been promising "five no-shows remove an
 * account" to users the whole time.
 *
 * Centralised because strikes now arrive from two directions (a late
 * cancellation, and a counterparty reporting a no-show) and both must go
 * through the same counting and the same threshold.
 */
@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a strike and applies the automatic ban if it takes the user to
   * the threshold. Idempotent per (user, booking, reason) — the unique index
   * makes a repeated report a no-op rather than a step toward a ban.
   */
  async recordStrike(userId: string, bookingId: string, reason: StrikeReason): Promise<void> {
    const created = await this.prisma.noShowRecord.createMany({
      data: [{ userId, bookingId, reason }],
      skipDuplicates: true,
    });

    // Nothing new recorded means this exact strike already existed; counting
    // again cannot change the outcome.
    if (created.count === 0) return;

    const strikes = await this.prisma.noShowRecord.count({ where: { userId } });
    if (!triggersAutoBan(strikes)) return;

    await this.applyAutomaticBan(userId, reason, strikes);
  }

  /**
   * `triggersAutoBan` is `>=`, so a user already at the threshold would be
   * re-banned on every subsequent strike. One active ban per user is enough.
   */
  private async applyAutomaticBan(
    userId: string,
    reason: StrikeReason,
    strikes: number,
  ): Promise<void> {
    const existing = await this.findActiveBan(userId);
    if (existing) return;

    await this.prisma.$transaction([
      this.prisma.ban.create({
        data: {
          userId,
          trigger: 'automatic',
          // A stated reason is required by the policy and is what an appeal
          // is reviewed against, so it names the count and the last cause
          // rather than saying "policy violation".
          reason: `${String(strikes)} recorded incidents, most recently ${STRIKE_LABELS[reason]}. Automatic under the ${String(NO_SHOW_COUNT_FOR_AUTO_BAN)}-incident rule.`,
        },
      }),
      // The documented ban lever: every already-issued access token carries
      // `ver`, and verifyAccessToken rejects any that no longer matches. This
      // ends live sessions immediately rather than at next token expiry.
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);

    this.logger.warn(`Automatic ban applied to user ${userId} after ${String(strikes)} incidents`);
  }

  /**
   * A ban is "not final until reviewed or the appeal window has passed"
   * (trust.ts) — but not final is not the same as not in effect. An overturned
   * appeal is the one state that restores access.
   */
  async findActiveBan(userId: string) {
    return this.prisma.ban.findFirst({
      where: { userId, appealStatus: { not: 'overturned' } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
