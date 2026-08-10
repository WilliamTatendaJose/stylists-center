import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from './payment-gateway.port';
import { Inject } from '@nestjs/common';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  /**
   * Paynow posts this asynchronously. A valid signature and the exact
   * booking/order amount are both required before the ledger is changed.
   */
  async receivePaynowCallback(body: Record<string, unknown>): Promise<void> {
    if (this.config.get('PAYMENT_PROVIDER', { infer: true }) !== 'paynow') {
      throw new NotFoundException();
    }
    const fields = toStringFields(body);
    if (!this.gateway.verifyCallback(fields)) {
      throw new ForbiddenException('Invalid Paynow callback signature');
    }

    const reference = fields.reference;
    const amountUsdCents = parseAmountCents(fields.amount);
    if (!reference || amountUsdCents === null) throw new ForbiddenException('Invalid Paynow callback');

    const [booking, order] = await Promise.all([
      this.prisma.booking.findUnique({ where: { reference } }),
      this.prisma.order.findUnique({ where: { reference } }),
    ]);
    if ((!booking && !order) || (booking && order)) throw new NotFoundException('Unknown Paynow reference');
    const expected = booking?.priceUsdCents ?? order?.totalUsdCents;
    if (expected === undefined) throw new NotFoundException('Unknown Paynow reference');
    if (expected !== amountUsdCents) throw new ForbiddenException('Paynow callback amount mismatch');
    const subjectWhere = booking
      ? { bookingId: booking.id }
      : order
        ? { orderId: order.id }
        : {};

    const prior = await this.prisma.payment.findFirst({
      where: {
        provider: 'paynow',
        ...subjectWhere,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) throw new NotFoundException('No Paynow payment was initiated');

    const status = ledgerStatus(fields.status);
    if (prior.status === status) return; // Paynow retries successful callbacks.
    // `released` is never a status Paynow itself reports (see ledgerStatus) —
    // it only exists once a booking/order has completed and escrow was paid
    // out internally. A Paynow callback arriving after that point is always a
    // stale retry of an earlier status; applying it would insert a newer
    // 'paid'/'held' row that outranks the release in every ordered-by-date
    // lookup (e.g. ProviderService.getEarnings), making a paid-out job look
    // pending again.
    if (prior.status === 'released') return;
    await this.prisma.payment.create({
      data: {
        ...subjectWhere,
        provider: 'paynow',
        status,
        amountUsdCents,
        feeUsdCents: status === 'refunded' ? 0 : prior.feeUsdCents,
        externalRef: fields.paynowreference ?? prior.externalRef,
      },
    });
  }
}

function toStringFields(body: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') throw new ForbiddenException('Invalid Paynow callback');
    fields[key.toLowerCase()] = value;
  }
  return fields;
}

function parseAmountCents(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function ledgerStatus(status: string | undefined): string {
  switch (status?.toLowerCase()) {
    case 'paid':
    case 'awaiting delivery':
    case 'delivered':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'cancelled':
      return 'failed';
    case 'disputed':
      return 'disputed';
    default:
      return 'pending';
  }
}
