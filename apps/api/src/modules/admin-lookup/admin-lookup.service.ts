import { Injectable } from '@nestjs/common';
import type {
  AdminBookingDetailDto,
  AdminBookingSummaryDto,
  AdminLookupResultDto,
  AdminOrderDetailDto,
  AdminOrderSummaryDto,
  AdminPaymentLedgerRowDto,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const PARTY_SELECT = { id: true, displayName: true, phone: true } satisfies Prisma.UserSelect;
const PROVIDER_PARTY_SELECT = {
  id: true,
  displayName: true,
  user: { select: { phone: true } },
} satisfies Prisma.ProviderProfileSelect;

const BOOKING_SUMMARY_INCLUDE = {
  client: { select: PARTY_SELECT },
  provider: { select: PROVIDER_PARTY_SELECT },
  service: { select: { name: true } },
} satisfies Prisma.BookingInclude;

const BOOKING_DETAIL_INCLUDE = {
  ...BOOKING_SUMMARY_INCLUDE,
  payments: { orderBy: { createdAt: 'desc' } },
  trips: true,
  reviews: { include: { rater: { select: PARTY_SELECT } } },
} satisfies Prisma.BookingInclude;

const ORDER_SUMMARY_INCLUDE = {
  buyer: { select: PARTY_SELECT },
  provider: { select: PROVIDER_PARTY_SELECT },
} satisfies Prisma.OrderInclude;

const ORDER_DETAIL_INCLUDE = {
  ...ORDER_SUMMARY_INCLUDE,
  items: true,
  payments: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;

type BookingSummary = Prisma.BookingGetPayload<{ include: typeof BOOKING_SUMMARY_INCLUDE }>;
type BookingDetail = Prisma.BookingGetPayload<{ include: typeof BOOKING_DETAIL_INCLUDE }>;
type OrderSummary = Prisma.OrderGetPayload<{ include: typeof ORDER_SUMMARY_INCLUDE }>;
type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

const SEARCH_LIMIT = 20;

/**
 * The support-facing counterpart to a raw database query: find a booking or
 * order by its client-facing reference (or a party's phone number) and see
 * everything about it — ledger entries included — in one place.
 */
@Injectable()
export class AdminLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string): Promise<AdminLookupResultDto> {
    const trimmed = q.trim();
    if (!trimmed) return { bookings: [], orders: [] };

    const [bookings, orders] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          OR: [
            { reference: { contains: trimmed, mode: 'insensitive' } },
            { client: { phone: { contains: trimmed } } },
            { provider: { user: { phone: { contains: trimmed } } } },
          ],
        },
        include: BOOKING_SUMMARY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: SEARCH_LIMIT,
      }),
      this.prisma.order.findMany({
        where: {
          OR: [
            { reference: { contains: trimmed, mode: 'insensitive' } },
            { buyer: { phone: { contains: trimmed } } },
            { provider: { user: { phone: { contains: trimmed } } } },
          ],
        },
        include: ORDER_SUMMARY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: SEARCH_LIMIT,
      }),
    ]);

    return { bookings: bookings.map(toBookingSummary), orders: orders.map(toOrderSummary) };
  }

  async getBooking(id: string): Promise<AdminBookingDetailDto> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });
    return toBookingDetail(booking);
  }

  async getOrder(id: string): Promise<AdminOrderDetailDto> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: ORDER_DETAIL_INCLUDE,
    });
    return toOrderDetail(order);
  }
}

function toLedgerRow(payment: {
  id: string;
  provider: string;
  status: string;
  amountUsdCents: number;
  feeUsdCents: number;
  externalRef: string | null;
  createdAt: Date;
}): AdminPaymentLedgerRowDto {
  return {
    id: payment.id,
    gateway: payment.provider,
    status: payment.status,
    amountUsdCents: payment.amountUsdCents,
    feeUsdCents: payment.feeUsdCents,
    externalRef: payment.externalRef,
    createdAt: payment.createdAt.toISOString(),
  };
}

function toBookingSummary(booking: BookingSummary): AdminBookingSummaryDto {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    client: booking.client,
    provider: {
      id: booking.provider.id,
      displayName: booking.provider.displayName,
      phone: booking.provider.user.phone,
    },
    serviceName: booking.service.name,
    paymentMethod: booking.paymentMethod,
    priceUsdCents: booking.priceUsdCents,
    startsAt: booking.startsAt.toISOString(),
    createdAt: booking.createdAt.toISOString(),
  };
}

function toBookingDetail(booking: BookingDetail): AdminBookingDetailDto {
  return {
    ...toBookingSummary(booking),
    confirmedByClient: booking.confirmedByClient,
    confirmedByProvider: booking.confirmedByProvider,
    payments: booking.payments.map(toLedgerRow),
    trips: booking.trips.map((trip) => ({
      mode: trip.mode,
      arrived: trip.arrived,
      etaSharedAt: trip.etaSharedAt?.toISOString() ?? null,
      checkedInAt: trip.checkedInAt?.toISOString() ?? null,
      startedAt: trip.startedAt.toISOString(),
    })),
    reviews: booking.reviews.map((review) => ({
      id: review.id,
      rater: review.rater,
      rating: review.rating,
      text: review.text,
      createdAt: review.createdAt.toISOString(),
    })),
  };
}

function toOrderSummary(order: OrderSummary): AdminOrderSummaryDto {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    buyer: order.buyer,
    provider: {
      id: order.provider.id,
      displayName: order.provider.displayName,
      phone: order.provider.user.phone,
    },
    paymentMethod: order.paymentMethod,
    totalUsdCents: order.totalUsdCents,
    createdAt: order.createdAt.toISOString(),
  };
}

function toOrderDetail(order: OrderDetail): AdminOrderDetailDto {
  return {
    ...toOrderSummary(order),
    items: order.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      priceUsdCents: item.priceUsdCents,
      quantity: item.quantity,
    })),
    payments: order.payments.map(toLedgerRow),
  };
}
