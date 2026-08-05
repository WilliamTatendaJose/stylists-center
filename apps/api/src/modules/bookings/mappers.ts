import type { BookingRowDto } from '@sc/shared';
import { canCancelBooking, formatBookingWhen } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: { provider: true; service: true };
}>;

export function toBookingRowDto(
  booking: BookingWithRelations,
  alreadyRated: boolean,
): BookingRowDto {
  return {
    id: booking.id,
    providerId: booking.providerId,
    counterpartyName: booking.provider.displayName,
    tint: booking.provider.tint,
    initials: booking.provider.initials,
    serviceName: booking.service.name,
    whenLabel: formatBookingWhen(booking.startsAt.toISOString()),
    startsAt: booking.startsAt.toISOString(),
    paymentMethod: booking.paymentMethod,
    priceUsdCents: booking.priceUsdCents,
    status: booking.status,
    confirmedByClient: booking.confirmedByClient,
    confirmedByProvider: booking.confirmedByProvider,
    /**
     * Travel actions unlock on confirmation, not before. Offering "I'm on my
     * way" while a booking is still `awaiting_provider` invites someone to
     * set off for an appointment nobody has accepted yet — and this is the
     * same status under which the stylist may still decline.
     */
    canTravel: booking.status === 'confirmed',
    canRate: booking.status === 'completed' && !alreadyRated,
    canCancel: canCancelBooking(booking.status),
  };
}
