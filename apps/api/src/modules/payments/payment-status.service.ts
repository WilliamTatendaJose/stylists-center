import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from './payment-gateway.port';
import { FAILURE_STATUSES, voidUnpaidSubject } from './void-unpaid';

/**
 * Statuses that will never change on their own. Anything else is still in
 * flight and worth asking the gateway about.
 */
const TERMINAL = new Set(['held', 'paid', 'released', 'refunded', 'failed', 'disputed']);

export interface PaymentSubject {
  bookingId?: string;
  orderId?: string;
  subscriptionProviderId?: string;
}

export interface PaymentStatusResult {
  /** 'none' means nothing was ever charged — a cash booking/order. */
  status: string;
  /** True when this call is what moved the payment to its current status. */
  changed: boolean;
}

/**
 * Answers "did this actually get paid?" for a booking, order, or
 * subscription, asking Paynow directly when the answer isn't already settled.
 *
 * Every checkout in this app used to be treated as successful the moment it
 * was *initiated* — the client opened a browser and the app moved straight to
 * its success screen. Paynow's callback is the authoritative answer, but it
 * cannot reach a server without a public URL and, even in production, arrives
 * some time after the customer approves. Polling closes that gap; the
 * callback still handles the case where nobody is watching the screen.
 */
@Injectable()
export class PaymentStatusService {
  private readonly logger = new Logger(PaymentStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async resolve(subject: PaymentSubject): Promise<PaymentStatusResult> {
    const payment = await this.prisma.payment.findFirst({
      where: subject,
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) return { status: 'none', changed: false };
    if (TERMINAL.has(payment.status) || payment.provider !== 'paynow' || !payment.externalRef) {
      return { status: payment.status, changed: false };
    }

    let polled: string;
    try {
      polled = await this.gateway.pollStatus(payment.externalRef);
    } catch (error) {
      // This endpoint is polled every few seconds by a waiting screen. A
      // Paynow blip must read as "still waiting", not as a failed request —
      // the payment itself is unaffected either way.
      this.logger.warn(
        `Paynow poll failed for payment ${payment.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: payment.status, changed: false };
    }

    if (polled === payment.status) return { status: payment.status, changed: false };

    await this.prisma.payment.create({
      data: {
        ...subject,
        provider: payment.provider,
        status: polled,
        amountUsdCents: payment.amountUsdCents,
        feeUsdCents: polled === 'refunded' ? 0 : payment.feeUsdCents,
        externalRef: payment.externalRef,
        reference: payment.reference,
      },
    });

    // The gateway has refused it: release whatever the payment was holding.
    if (FAILURE_STATUSES.has(polled)) {
      await voidUnpaidSubject(this.prisma, subject);
    }
    return { status: polled, changed: true };
  }
}
