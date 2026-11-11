import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PayChannelsResponse, type SubmitPaymentOtpInput } from '@sc/shared';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { ledgerStatus } from './ledger-status';
import {
  PAYMENT_GATEWAY,
  type PaymentConfirmation,
  type PaymentGatewayPort,
  type PaymentProvider,
} from './payment-gateway.port';
import { FAILURE_STATUSES, voidUnpaidSubject } from './void-unpaid';
import { Inject, Optional } from '@nestjs/common';
import { recordFeePaymentStatus } from './fee-payment';
import { offeredChannels } from './pay-channels';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Optional() private readonly feeLedger?: FeeLedgerService,
  ) {}

  /** What the payment screens should offer: the live gateway's channels, narrowed by PAYMENT_CHANNELS. */
  channels(): PayChannelsResponse {
    return {
      channels: offeredChannels(this.gateway, this.config.get('PAYMENT_CHANNELS', { infer: true })),
    };
  }

  /**
   * Forwards an O'mari one-time code for a payment the caller is paying.
   *
   * The OTP URL is looked up server-side from the newest Payment row started
   * under this reference, and the caller must be that payment's payer (the
   * booking's client, the order's buyer, or the stylist or vendor paying fees). The
   * client never sees or chooses the URL, so this cannot be pointed anywhere
   * else. The outcome still arrives through the usual poll or callback.
   */
  async submitOtp(userId: string, input: SubmitPaymentOtpInput): Promise<void> {
    if (!this.gateway.submitOtp) {
      throw new BadRequestException('This payment does not take a code');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { reference: input.reference },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        otpUrl: true,
        booking: { select: { clientId: true } },
        order: { select: { buyerId: true } },
        feeProvider: { select: { userId: true } },
      },
    });
    const payerId =
      payment?.booking?.clientId ?? payment?.order?.buyerId ?? payment?.feeProvider?.userId;
    // One answer for "no such payment" and "not yours", so a reference cannot be probed.
    if (!payment || payerId !== userId) throw new NotFoundException('Payment not found');
    if (!payment.otpUrl || payment.status !== 'pending') {
      throw new BadRequestException('This payment is not waiting for a code');
    }
    await this.gateway.submitOtp(payment.otpUrl, input.otp);
  }

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
    if (!reference || amountUsdCents === null)
      throw new ForbiddenException('Invalid Paynow callback');

    await this.applyConfirmation('paynow', {
      reference,
      amountUsdCents,
      status: ledgerStatus(fields.status),
      ...(fields.paynowreference ? { externalRef: fields.paynowreference } : {}),
    });
  }

  /**
   * Pesepay posts this asynchronously, and signs none of it.
   *
   * So the body is read only far enough to learn which transaction moved; the
   * status and the amount both come back from Pesepay's own authenticated API
   * (see PesepayAdapter.confirmCallback). Anyone who can guess a reference can
   * therefore make this endpoint re-check a payment, which is harmless — they
   * cannot make it record an outcome Pesepay did not report.
   */
  async receivePesepayCallback(body: Record<string, unknown>): Promise<void> {
    if (this.config.get('PAYMENT_PROVIDER', { infer: true }) !== 'pesepay') {
      throw new NotFoundException();
    }
    if (!this.gateway.confirmCallback) {
      throw new NotFoundException();
    }
    await this.applyConfirmation('pesepay', await this.gateway.confirmCallback(body));
  }

  /**
   * Writes a confirmed gateway outcome into the ledger, whichever gateway and
   * whichever route (signed callback or authenticated re-check) it arrived by.
   *
   * The amount is checked against what the booking/order/fee payment actually
   * costs before anything is written, so a callback can only ever confirm the
   * payment this app asked for.
   */
  private async applyConfirmation(
    provider: Extract<PaymentProvider, 'paynow' | 'pesepay'>,
    // Paynow's callback may omit its own reference; Pesepay's re-check never does.
    confirmation: Omit<PaymentConfirmation, 'externalRef'> & { externalRef?: string },
  ): Promise<void> {
    const label = provider === 'pesepay' ? 'Pesepay' : 'Paynow';
    const { reference, amountUsdCents, status } = confirmation;

    const [booking, order] = await Promise.all([
      this.prisma.booking.findUnique({ where: { reference } }),
      this.prisma.order.findUnique({ where: { reference } }),
    ]);
    if (booking && order) throw new NotFoundException(`Unknown ${label} reference`);

    // A fee payment has no booking/order row to resolve against: it is
    // identified only by the reference its Payment was initiated under.
    const feePayment =
      booking || order
        ? null
        : await this.prisma.payment.findFirst({
            where: { reference, feeProviderId: { not: null } },
            orderBy: { createdAt: 'desc' },
          });

    const expected = booking?.priceUsdCents ?? order?.totalUsdCents ?? feePayment?.amountUsdCents;
    if (expected === undefined) throw new NotFoundException(`Unknown ${label} reference`);
    if (expected !== amountUsdCents)
      throw new ForbiddenException(`${label} callback amount mismatch`);

    if (feePayment?.feeProviderId) {
      await recordFeePaymentStatus(
        this.prisma,
        this.feeLedger ?? new FeeLedgerService(this.prisma),
        {
          providerId: feePayment.feeProviderId,
          reference,
          status,
          ...(confirmation.externalRef ? { externalRef: confirmation.externalRef } : {}),
        },
      );
      return;
    }

    const subjectWhere = booking ? { bookingId: booking.id } : order ? { orderId: order.id } : {};

    const prior = await this.prisma.payment.findFirst({
      where: {
        provider,
        ...subjectWhere,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) throw new NotFoundException(`No ${label} payment was initiated`);

    if (prior.status === status) return; // Both gateways retry successful callbacks.
    // `released` is never a status a gateway itself reports (see ledgerStatus
    // and pesepayLedgerStatus) — it only exists once a booking/order has
    // completed and escrow was paid out internally. A callback arriving after
    // that point is always a stale retry of an earlier status; applying it
    // would insert a newer 'paid'/'held' row that outranks the release in
    // every ordered-by-date lookup (e.g. ProviderService.getEarnings), making
    // a paid-out job look pending again.
    if (prior.status === 'released') return;
    await this.prisma.payment.create({
      data: {
        ...subjectWhere,
        provider,
        status,
        amountUsdCents,
        feeUsdCents: status === 'refunded' ? 0 : prior.feeUsdCents,
        externalRef: confirmation.externalRef ?? prior.externalRef,
        reference,
        channel: prior.channel,
      },
    });

    // The gateway refused it. This is the path that matters when nobody is
    // watching — the customer closed the app, so no poll will ever run.
    if (FAILURE_STATUSES.has(status)) {
      await voidUnpaidSubject(this.prisma, subjectWhere);
    }
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
