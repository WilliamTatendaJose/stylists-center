import type { BookingRowDto } from '@sc/shared';
import { formatBookingWhen } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: { provider: true; service: true };
}>;

export function toBookingRowDto(booking: BookingWithRelations, alreadyRated: boolean): BookingRowDto {
  return {
    id: booking.id,
    providerId: booking.providerId,
    counterpartyName: booking.provider.displayName,
    tint: booking.provider.tint,
    initials: booking.provider.initials,
    serviceName: booking.service.name,
    whenLabel: formatBookingWhen(booking.startsAt.toISOString()),
    paymentMethod: booking.paymentMethod,
    priceUsdCents: booking.priceUsdCents,
    status: booking.status,
    confirmedByClient: booking.confirmedByClient,
    confirmedByProvider: booking.confirmedByProvider,
    canTravel: booking.status === 'awaiting_provider',
    canRate: booking.status === 'completed' && !alreadyRated,
  };
}
