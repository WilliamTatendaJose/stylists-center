import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export const PROVIDER_RESPONSE_WINDOW_MINUTES = 60;

/**
 * Lazily closes booking requests whose stylist response window elapsed.
 *
 * Running this before either side lists bookings gives us scheduler semantics
 * without pretending an old request is still actionable. The advisory lock
 * makes the status transition and append-only refund safe when client and
 * provider refresh at the same time.
 */
export async function expireStaleBookingRequests(
  prisma: PrismaService,
  scope: Pick<Prisma.BookingWhereInput, 'clientId' | 'providerId'>,
): Promise<void> {
  const cutoff = new Date(Date.now() - PROVIDER_RESPONSE_WINDOW_MINUTES * 60_000);
  const stale = await prisma.booking.findMany({
    where: {
      ...scope,
      status: 'awaiting_provider',
      createdAt: { lte: cutoff },
    },
    select: { id: true },
  });

  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const booking = await tx.booking.findUniqueOrThrow({ where: { id } });
      if (booking.status !== 'awaiting_provider' || booking.createdAt > cutoff) return;

      const currentPayment =
        booking.paymentMethod === 'ecocash'
          ? await tx.payment.findFirst({
              where: { bookingId: id },
              orderBy: { createdAt: 'desc' },
            })
          : null;

      await tx.booking.update({ where: { id }, data: { status: 'declined' } });

      if (currentPayment && ['paid', 'held'].includes(currentPayment.status)) {
        await tx.payment.create({
          data: {
            bookingId: id,
            provider: currentPayment.provider,
            status: 'refunded',
            amountUsdCents: currentPayment.amountUsdCents,
            feeUsdCents: 0,
            externalRef: currentPayment.externalRef,
          },
        });
      }
    });
  }
}
