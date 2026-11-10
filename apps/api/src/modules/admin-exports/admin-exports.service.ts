import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { harareTime, toCsv, usd } from '../../common/csv';

interface Range {
  start: Date;
  end: Date;
}

/**
 * Finance exports for reconciling against Paynow/Pesepay/EcoCash statements
 * and the payout/cash-out records kept outside the app. Every row in range
 * is exported (no paging); ranges are capped at a year by harareDateRange.
 * Times are Harare local; money is in USD dollars.
 */
@Injectable()
export class AdminExportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every ledger movement in range: one row per held/released/refunded/failed entry. */
  async paymentsCsv(range: Range): Promise<string> {
    const rows = await this.prisma.payment.findMany({
      where: { createdAt: { gte: range.start, lt: range.end } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        booking: { select: { reference: true, provider: { select: { displayName: true } } } },
        order: { select: { reference: true, provider: { select: { displayName: true } } } },
        subscriptionProvider: { select: { displayName: true } },
      },
    });
    return toCsv(
      [
        'Date (Harare)',
        'Type',
        'Reference',
        'Stylist',
        'Gateway',
        'Status',
        'Amount (USD)',
        'Fee (USD)',
        'Net to stylist (USD)',
        'Gateway reference',
        'Payment ID',
      ],
      rows.map((p) => {
        const type = p.booking ? 'Booking' : p.order ? 'Order' : 'Subscription';
        const reference = p.booking?.reference ?? p.order?.reference ?? p.reference ?? '';
        const stylist =
          p.booking?.provider.displayName ??
          p.order?.provider.displayName ??
          p.subscriptionProvider?.displayName ??
          '';
        return [
          harareTime(p.createdAt),
          type,
          reference,
          stylist,
          p.provider,
          p.status,
          usd(p.amountUsdCents),
          usd(p.feeUsdCents),
          type === 'Subscription' ? 0 : usd(p.amountUsdCents - p.feeUsdCents),
          p.externalRef,
          p.id,
        ];
      }),
    );
  }

  /** Payouts an admin recorded as paid to stylists outside the app. */
  async payoutsCsv(range: Range): Promise<string> {
    const rows = await this.prisma.payout.findMany({
      where: { createdAt: { gte: range.start, lt: range.end } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        provider: { select: { displayName: true, user: { select: { phone: true } } } },
      },
    });
    return toCsv(
      ['Date (Harare)', 'Stylist', 'Phone', 'Amount (USD)', 'Note', 'Payout ID'],
      rows.map((p) => [
        harareTime(p.createdAt),
        p.provider.displayName,
        p.provider.user.phone,
        usd(p.amountUsdCents),
        p.note,
        p.id,
      ]),
    );
  }

  /** Agent/stylist coin cash-out requests made in range, with whether they've been settled. */
  async cashOutsCsv(range: Range): Promise<string> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { type: 'cash_out', createdAt: { gte: range.start, lt: range.end } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        user: { select: { displayName: true, phone: true } },
        cashOutSettlement: true,
      },
    });
    return toCsv(
      [
        'Requested (Harare)',
        'Name',
        'Phone',
        'Coins',
        'Amount (USD)',
        'Settled',
        'Settled at (Harare)',
        'Settlement note',
        'Transaction ID',
      ],
      rows.map((t) => [
        harareTime(t.createdAt),
        t.user.displayName,
        t.user.phone,
        // Stored negative (a debit); the export shows the amount requested.
        -t.coins,
        usd(-t.usdCents),
        t.cashOutSettlement ? 'Yes' : 'No',
        t.cashOutSettlement ? harareTime(t.cashOutSettlement.createdAt) : '',
        t.cashOutSettlement?.note,
        t.id,
      ]),
    );
  }
}
