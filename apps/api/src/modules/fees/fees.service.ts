import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  formatUsd,
  MIN_FEE_PAYMENT_USD_CENTS,
  type FeeEntryDto,
  type FeePaymentStatusDto,
  type FeeStatementDto,
  type FeeSummaryDto,
  type PayFeesInput,
  type PayFeesResponse,
} from '@sc/shared';
import type { FeeLedgerEntry, FeeStatement } from '../../generated/prisma';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../payments/payment-gateway.port';
import { PaymentStatusService } from '../payments/payment-status.service';
import { recordFeePaymentStatus } from '../payments/fee-payment';
import { payerPhoneFor } from '../payments/pay-channels';
import { PrismaService } from '../prisma/prisma.service';
import { harareMonthKey, harareMonthStart } from './fee-periods';
import { FeeLedgerService } from './fee-ledger.service';
import { FeeStandingService } from './fee-standing.service';
import { FeeStatementService } from './fee-statement.service';

/** A started payment that has not settled after this long no longer counts as "in progress". */
const PENDING_PAYMENT_WINDOW_MS = 30 * 60_000;

/**
 * The stylist's and vendor's own view of what they owe, and paying it.
 *
 * Paying follows the same pattern the old subscription payment did: starting
 * a checkout only proves a prompt was sent. The balance is credited once,
 * through `recordFeePaymentStatus`, when the gateway reports 'paid' (by
 * callback or poll, whichever arrives first).
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FeeLedgerService,
    private readonly standing: FeeStandingService,
    private readonly statements: FeeStatementService,
    private readonly paymentStatus: PaymentStatusService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async summary(providerId: string): Promise<FeeSummaryDto> {
    const now = new Date();
    const since = harareMonthStart(harareMonthKey(now));
    const [balance, month, latest, standing, pending, unpaid] = await Promise.all([
      this.ledger.balance(providerId),
      this.prisma.feeLedgerEntry.groupBy({
        by: ['kind'],
        where: { providerId, createdAt: { gte: since } },
        _sum: { amountUsdCents: true },
        _count: { _all: true },
      }),
      this.prisma.feeStatement.findFirst({
        where: { providerId },
        orderBy: { periodStart: 'desc' },
      }),
      this.standing.standing([providerId], now),
      this.prisma.payment.findFirst({
        where: {
          feeProviderId: providerId,
          createdAt: { gte: new Date(now.getTime() - PENDING_PAYMENT_WINDOW_MS) },
        },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      }),
      this.standing.unpaidStatements([providerId]),
    ]);

    // "This month so far" is what the month's jobs cost, net of fees taken
    // back: payments and adjustments are about the balance, not the month's work.
    const jobKinds = new Set(['booking_fee', 'order_fee', 'waiver']);
    const worked = month.filter((row) => jobKinds.has(row.kind));
    const unpaidById = new Map(unpaid.map((u) => [u.statementId, u.unpaidUsdCents]));
    const own = standing.get(providerId);

    return {
      balanceUsdCents: balance,
      minPaymentUsdCents: MIN_FEE_PAYMENT_USD_CENTS,
      thisMonth: {
        since: since.toISOString(),
        jobCount: month
          .filter((row) => row.kind === 'booking_fee' || row.kind === 'order_fee')
          .reduce((n, row) => n + row._count._all, 0),
        feesUsdCents: worked.reduce((sum, row) => sum + (row._sum.amountUsdCents ?? 0), 0),
      },
      latestStatement: latest
        ? toStatementDto(latest, unpaidById.get(latest.id) ?? 0, balance)
        : null,
      overdueUsdCents: own?.overdueUsdCents ?? 0,
      restricted: own?.restricted ?? false,
      paymentPending: pending?.status === 'pending',
    };
  }

  async listStatements(providerId: string): Promise<FeeStatementDto[]> {
    const [rows, unpaid, balance] = await Promise.all([
      this.statements.list(providerId),
      this.standing.unpaidStatements([providerId]),
      this.ledger.balance(providerId),
    ]);
    const unpaidById = new Map(unpaid.map((u) => [u.statementId, u.unpaidUsdCents]));
    return rows.map((row) => toStatementDto(row, unpaidById.get(row.id) ?? 0, balance));
  }

  /** Newest first, with the job each fee belongs to. */
  async listEntries(
    providerId: string,
    page: { limit: number; offset: number },
  ): Promise<{ items: FeeEntryDto[]; nextOffset: number | null }> {
    const rows = await this.prisma.feeLedgerEntry.findMany({
      where: { providerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      skip: page.offset,
    });
    const items = await this.toEntryDtos(rows.slice(0, page.limit));
    return { items, nextOffset: rows.length > page.limit ? page.offset + page.limit : null };
  }

  async toEntryDtos(rows: FeeLedgerEntry[]): Promise<FeeEntryDto[]> {
    const bookingIds = rows.flatMap((r) => (r.bookingId ? [r.bookingId] : []));
    const orderIds = rows.flatMap((r) => (r.orderId ? [r.orderId] : []));
    const [bookings, orders] = await Promise.all([
      this.prisma.booking.findMany({
        where: { id: { in: bookingIds } },
        select: { id: true, reference: true, service: { select: { name: true } } },
      }),
      this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, reference: true },
      }),
    ]);
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const orderById = new Map(orders.map((o) => [o.id, o]));
    return rows.map((row) => {
      const booking = row.bookingId ? bookingById.get(row.bookingId) : undefined;
      const order = row.orderId ? orderById.get(row.orderId) : undefined;
      return {
        id: row.id,
        kind: row.kind,
        amountUsdCents: row.amountUsdCents,
        baseUsdCents: row.baseUsdCents,
        rateBps: row.rateBps,
        reference: booking?.reference ?? order?.reference ?? null,
        label: booking ? booking.service.name : order ? 'Marketplace order' : null,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /** Starts paying the balance (or part of it) through the gateway. */
  async pay(providerId: string, input: PayFeesInput): Promise<PayFeesResponse> {
    const balance = await this.ledger.balance(providerId);
    if (balance <= 0) throw new BadRequestException("You don't owe any fees right now");
    const amountUsdCents = input.amountUsdCents ?? balance;
    if (amountUsdCents > balance) {
      throw new BadRequestException(`You owe ${formatUsd(balance)}. Enter that amount or less`);
    }
    // Paying everything is always allowed, even when it is under the minimum.
    if (amountUsdCents < Math.min(MIN_FEE_PAYMENT_USD_CENTS, balance)) {
      throw new BadRequestException(
        `The smallest payment is ${formatUsd(MIN_FEE_PAYMENT_USD_CENTS)}`,
      );
    }

    const user = await this.prisma.user.findFirstOrThrow({
      where: { providerProfile: { id: providerId } },
      select: { phone: true },
    });
    const payChannel = input.payChannel ?? 'ecocash';
    const paymentPhone = payerPhoneFor(payChannel, input.payerPhone, user.phone);
    const reference = `FEE-${providerId}-${String(Date.now())}`;
    const intent = await this.gateway.createCheckout({
      reference,
      amountUsdCents,
      description: 'StylistsCenter fees',
      channel: payChannel,
      ...(paymentPhone ? { phone: paymentPhone } : {}),
    });
    await this.prisma.payment.create({
      data: {
        feeProviderId: providerId,
        provider: intent.provider,
        status: intent.status,
        amountUsdCents,
        externalRef: intent.externalRef,
        reference,
        channel: payChannel,
        otpUrl: intent.otpUrl ?? null,
      },
    });

    // The fake dev adapter settles instantly ('held'); a real gateway returns
    // 'pending' and is credited only once a poll or callback confirms it.
    const paidNow = intent.status === 'held';
    if (paidNow) {
      await recordFeePaymentStatus(this.prisma, this.ledger, {
        providerId,
        reference,
        status: 'paid',
      });
    }
    return {
      amountUsdCents,
      pending: !paidNow,
      ...(intent.checkoutUrl ? { checkoutUrl: intent.checkoutUrl } : {}),
      ...(intent.instructions ? { instructions: intent.instructions } : {}),
      ...(intent.action ? { action: intent.action } : {}),
      reference,
    };
  }

  /** Polled by the app while a payment is in flight. */
  async paymentStatusFor(providerId: string): Promise<FeePaymentStatusDto> {
    const result = await this.paymentStatus.resolve({ feeProviderId: providerId });
    return {
      status: result.status as FeePaymentStatusDto['status'],
      balanceUsdCents: await this.ledger.balance(providerId),
    };
  }
}

function toStatementDto(
  row: FeeStatement,
  unpaidUsdCents: number,
  balance: number,
): FeeStatementDto {
  return {
    id: row.id,
    month: row.month,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    openingUsdCents: row.openingUsdCents,
    bookingFeesUsdCents: row.bookingFeesUsdCents,
    orderFeesUsdCents: row.orderFeesUsdCents,
    waiversUsdCents: row.waiversUsdCents,
    paymentsUsdCents: row.paymentsUsdCents,
    adjustmentsUsdCents: row.adjustmentsUsdCents,
    closingUsdCents: row.closingUsdCents,
    dueAt: row.dueAt.toISOString(),
    // Never show more unpaid than the provider owes now.
    unpaidUsdCents: Math.max(0, Math.min(unpaidUsdCents, balance)),
    generatedAt: row.generatedAt.toISOString(),
  };
}
