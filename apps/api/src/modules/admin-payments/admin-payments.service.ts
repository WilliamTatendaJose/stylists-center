import { Injectable } from '@nestjs/common';
import type {
  AdminPaymentsOverviewDto,
  AdminPayoutRowDto,
  AdminProviderPayoutRowDto,
  RecordPayoutInput,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const ESCROW_PAYMENT_SELECT = {
  bookingId: true,
  orderId: true,
  status: true,
  amountUsdCents: true,
  feeUsdCents: true,
  booking: { select: { providerId: true } },
  order: { select: { providerId: true } },
} satisfies Prisma.PaymentSelect;

type EscrowPayment = Prisma.PaymentGetPayload<{ select: typeof ESCROW_PAYMENT_SELECT }>;

interface CurrentEscrowEntry {
  providerId: string | null;
  status: string;
  amountUsdCents: number;
  feeUsdCents: number;
}

const HELD_STATUSES = new Set(['pending', 'paid', 'held', 'disputed']);

/**
 * `Payment.status = 'released'` only marks escrow as settled inside this
 * ledger (see the model's doc comment) — nothing here means a provider was
 * actually paid, and nothing in the codebase's PaymentGatewayPort can move
 * real money to one. This service gives admins visibility into the escrow
 * ledger (booking/order payments only — subscription payments are the
 * provider paying the platform, the opposite direction) and a way to record
 * that a real-world payout happened, via the separate append-only Payout
 * table. It never writes to Payment.
 */
@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminPaymentsOverviewDto> {
    const [current, payoutSum] = await Promise.all([
      this.currentEscrowPayments(),
      this.prisma.payout.aggregate({ _sum: { amountUsdCents: true } }),
    ]);

    let heldUsdCents = 0;
    let releasedUsdCents = 0;
    let refundedUsdCents = 0;
    let failedUsdCents = 0;
    for (const payment of current) {
      if (payment.status === 'released') {
        releasedUsdCents += payment.amountUsdCents - payment.feeUsdCents;
      } else if (HELD_STATUSES.has(payment.status)) {
        heldUsdCents += payment.amountUsdCents;
      } else if (payment.status === 'refunded') {
        refundedUsdCents += payment.amountUsdCents;
      } else if (payment.status === 'failed') {
        failedUsdCents += payment.amountUsdCents;
      }
    }

    const paidOutUsdCents = payoutSum._sum.amountUsdCents ?? 0;

    return {
      heldUsdCents,
      releasedUsdCents,
      refundedUsdCents,
      failedUsdCents,
      paidOutUsdCents,
      owedUsdCents: Math.max(0, releasedUsdCents - paidOutUsdCents),
    };
  }

  async providerPayouts(): Promise<AdminProviderPayoutRowDto[]> {
    const [current, providers, payouts] = await Promise.all([
      this.currentEscrowPayments(),
      this.prisma.providerProfile.findMany({
        select: { id: true, displayName: true, user: { select: { phone: true } } },
      }),
      this.prisma.payout.groupBy({
        by: ['providerId'],
        _sum: { amountUsdCents: true },
        _max: { createdAt: true },
      }),
    ]);

    const releasedByProvider = new Map<string, number>();
    for (const payment of current) {
      if (payment.status !== 'released' || !payment.providerId) continue;
      releasedByProvider.set(
        payment.providerId,
        (releasedByProvider.get(payment.providerId) ?? 0) + payment.amountUsdCents - payment.feeUsdCents,
      );
    }

    const payoutByProvider = new Map(
      payouts.map((p) => [p.providerId, { sum: p._sum.amountUsdCents ?? 0, lastAt: p._max.createdAt }]),
    );

    return providers
      .map((provider): AdminProviderPayoutRowDto => {
        const releasedUsdCents = releasedByProvider.get(provider.id) ?? 0;
        const payoutInfo = payoutByProvider.get(provider.id);
        const paidOutUsdCents = payoutInfo?.sum ?? 0;
        return {
          providerId: provider.id,
          displayName: provider.displayName,
          phone: provider.user.phone,
          releasedUsdCents,
          paidOutUsdCents,
          owedUsdCents: Math.max(0, releasedUsdCents - paidOutUsdCents),
          lastPayoutAt: payoutInfo?.lastAt?.toISOString() ?? null,
        };
      })
      .filter((row) => row.releasedUsdCents > 0 || row.paidOutUsdCents > 0)
      .sort((a, b) => b.owedUsdCents - a.owedUsdCents);
  }

  async recordPayout(providerId: string, input: RecordPayoutInput): Promise<AdminPayoutRowDto> {
    await this.prisma.providerProfile.findUniqueOrThrow({ where: { id: providerId } });
    const payout = await this.prisma.payout.create({
      data: {
        providerId,
        amountUsdCents: input.amountUsdCents,
        note: input.note ?? null,
      },
    });
    return toPayoutRow(payout);
  }

  /**
   * The ledger is append-only, so a settled booking/order has both a held
   * row and a newer released row (same shape as ProviderService.getEarnings,
   * generalized across all providers instead of one). Dedupes to the latest
   * row per booking/order so totals reflect current state, not every
   * historical movement.
   */
  private async currentEscrowPayments(): Promise<CurrentEscrowEntry[]> {
    const payments: EscrowPayment[] = await this.prisma.payment.findMany({
      where: { OR: [{ bookingId: { not: null } }, { orderId: { not: null } }] },
      select: ESCROW_PAYMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Set<string>();
    const current: CurrentEscrowEntry[] = [];
    for (const payment of payments) {
      const subject = payment.bookingId ? `booking:${payment.bookingId}` : `order:${String(payment.orderId)}`;
      if (seen.has(subject)) continue;
      seen.add(subject);
      current.push({
        providerId: payment.booking?.providerId ?? payment.order?.providerId ?? null,
        status: payment.status,
        amountUsdCents: payment.amountUsdCents,
        feeUsdCents: payment.feeUsdCents,
      });
    }
    return current;
  }
}

function toPayoutRow(payout: {
  id: string;
  providerId: string;
  amountUsdCents: number;
  note: string | null;
  createdAt: Date;
}): AdminPayoutRowDto {
  return {
    id: payout.id,
    providerId: payout.providerId,
    amountUsdCents: payout.amountUsdCents,
    note: payout.note,
    createdAt: payout.createdAt.toISOString(),
  };
}
