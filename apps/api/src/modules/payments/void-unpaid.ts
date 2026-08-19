import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentSubject } from './payment-status.service';

/** Gateway verdicts that mean the money will never arrive. */
export const FAILURE_STATUSES = new Set(['failed', 'refunded', 'disputed']);

const logger = new Logger('VoidUnpaid');

/**
 * Undoes what a payment was holding, once the gateway has refused it.
 *
 * EcoCash is paid up front, so "Paynow said no" means there is nothing to
 * honour — but the booking or order was already written (it has to be, to have
 * something for the payment to reference). Left alone, a refused payment
 * showed up to the stylist as a live job and kept its slot, or held stock the
 * seller could no longer sell to anyone else.
 *
 * This runs on the server, not the app: the client can only do this while its
 * payment screen is open, so force-quitting mid-checkout left the booking live
 * and unpaid forever. Both the poll and Paynow's callback land here, so it
 * holds whether or not anyone is still watching.
 *
 * Deliberately NOT the user-facing cancel path: a refused payment is not
 * somebody changing their mind, and must not carry a late-cancellation
 * penalty or count against anyone's trust score.
 *
 * Idempotent — callbacks retry, and the poll can see the same verdict twice.
 */
export async function voidUnpaidSubject(
  prisma: PrismaService,
  subject: PaymentSubject,
): Promise<void> {
  if (subject.bookingId) {
    // Only while it is still someone's pending/accepted appointment. A booking
    // already completed, declined or cancelled is not ours to rewrite.
    const { count } = await prisma.booking.updateMany({
      where: { id: subject.bookingId, status: { in: ['awaiting_provider', 'confirmed'] } },
      data: { status: 'cancelled' },
    });
    if (count > 0) {
      logger.log(`Cancelled booking ${subject.bookingId} — payment was refused`);
    }
    return;
  }

  if (subject.orderId) {
    const orderId = subject.orderId;
    await prisma.$transaction(async (tx) => {
      // The status guard doubles as the idempotency guard: a second call finds
      // nothing to update and must not put the stock back twice.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['reserved', 'ready_for_collection'] } },
        data: { status: 'cancelled' },
      });
      if (count === 0) return;

      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }
      logger.log(`Cancelled order ${orderId} and restored its stock — payment was refused`);
    });
    return;
  }

  // Subscriptions need nothing undone: `subscriptionPaidUntil` is only ever
  // extended from a payment that already reached 'paid', so a refused one
  // never bought anything to take back.
}
