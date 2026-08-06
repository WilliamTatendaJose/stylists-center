import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canProviderRespond,
  formatBookingWhen,
  needsCashReconciliation,
  providerOwesCompletion,
  type ProviderAvailabilityDto,
  type ProviderBookingRowDto,
  type ProviderEarningsDto,
  type ProviderEarningsEntryDto,
  type ProviderJobsDto,
  type ProviderOfferDto,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { MatchingService } from '../matching/matching.service';
import { toBookingRowDto } from '../bookings/mappers';

/** Statuses a stylist still has something to do about, plus recent history for context. */
const ACTIVE_STATUSES = ['awaiting_provider', 'confirmed'] as const;

@Injectable()
export class ProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly matching: MatchingService,
  ) {}

  /** One request for the whole Jobs screen — availability, live offers, and the work itself. */
  async getJobs(providerProfileId: string): Promise<ProviderJobsDto> {
    const [profile, offers, bookings] = await Promise.all([
      this.prisma.providerProfile.findUniqueOrThrow({
        where: { id: providerProfileId },
        select: { acceptingBookings: true },
      }),
      this.listOffers(providerProfileId),
      this.listBookings(providerProfileId),
    ]);

    return { acceptingBookings: profile.acceptingBookings, offers, bookings };
  }

  private async listBookings(providerProfileId: string): Promise<ProviderBookingRowDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { providerId: providerProfileId, status: { in: [...ACTIVE_STATUSES] } },
      include: { client: true, service: true },
      orderBy: { startsAt: 'asc' },
    });

    return bookings.map((b) => ({
      id: b.id,
      reference: b.reference,
      clientName: b.client.displayName,
      serviceName: b.service.name,
      whenLabel: formatBookingWhen(b.startsAt.toISOString()),
      startsAt: b.startsAt.toISOString(),
      paymentMethod: b.paymentMethod,
      priceUsdCents: b.priceUsdCents,
      status: b.status,
      confirmedByClient: b.confirmedByClient,
      confirmedByProvider: b.confirmedByProvider,
      canConfirm: canProviderRespond(b.status),
      canDecline: canProviderRespond(b.status),
      canConfirmCompletion: providerOwesCompletion({
        paymentMethod: b.paymentMethod,
        status: b.status,
        confirmedByProvider: b.confirmedByProvider,
      }),
    }));
  }

  private async listOffers(providerProfileId: string): Promise<ProviderOfferDto[]> {
    const offers = await this.prisma.matchOffer.findMany({
      where: {
        providerId: providerProfileId,
        state: 'offered',
        // An offer past its response deadline is not answerable; showing it
        // would invite a tap that can only fail.
        respondBy: { gt: new Date() },
      },
      include: { matchRequest: { include: { category: true } } },
      orderBy: { respondBy: 'asc' },
    });

    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { latitude: true, longitude: true },
    });

    return offers.map((offer) => ({
      id: offer.id,
      matchId: offer.matchRequestId,
      categoryName: offer.matchRequest.category.name,
      budgetUsdCents: offer.matchRequest.budgetAmountUsdCents,
      quoteUsdCents: offer.quoteUsdCents,
      distanceKm: haversineKm(
        profile.latitude,
        profile.longitude,
        offer.matchRequest.latitude,
        offer.matchRequest.longitude,
      ),
      respondBy: offer.respondBy.toISOString(),
    }));
  }

  /**
   * Accept a booking request. This is the transition nothing could perform —
   * `confirmedByProvider` was read in three places and written in none, so
   * every booking a client made stayed "Awaiting stylist" forever.
   */
  async confirmBooking(bookingId: string, providerProfileId: string): Promise<void> {
    const booking = await this.requireOwnBooking(bookingId, providerProfileId);
    if (!canProviderRespond(booking.status)) {
      throw new BadRequestException(`Cannot confirm a booking that is ${booking.status}`);
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' },
    });
    await this.notifyClient(bookingId, booking.clientId);
  }

  async declineBooking(bookingId: string, providerProfileId: string): Promise<void> {
    const booking = await this.requireOwnBooking(bookingId, providerProfileId);
    if (!canProviderRespond(booking.status)) {
      throw new BadRequestException(`Cannot decline a booking that is ${booking.status}`);
    }

    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'declined' } });
    // Declining frees the slot, so any escrow held for it must go back —
    // the client is not paying for something that will not happen.
    await this.refundIfHeld(bookingId);
    await this.notifyClient(bookingId, booking.clientId);
  }

  /**
   * The stylist's half of a cash job's double confirmation.
   *
   * The client's Bookings screen has been saying "Waiting on <stylist> —
   * closes when you both confirm" with no way for the stylist to do so, which
   * left every cash booking permanently half-closed.
   */
  async confirmCompletion(bookingId: string, providerProfileId: string): Promise<void> {
    const booking = await this.requireOwnBooking(bookingId, providerProfileId);
    if (booking.status !== 'confirmed') {
      throw new BadRequestException(`Cannot complete a booking that is ${booking.status}`);
    }
    if (booking.confirmedByProvider) return;

    const stillNeedsReconciliation = needsCashReconciliation({
      paymentMethod: booking.paymentMethod,
      status: booking.status,
      confirmedByClient: booking.confirmedByClient,
      confirmedByProvider: true,
    });

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        confirmedByProvider: true,
        // Completes only once BOTH sides have confirmed — the stylist saying
        // so alone is exactly the one-sided claim the double confirmation
        // exists to prevent.
        status: stillNeedsReconciliation ? booking.status : 'completed',
      },
    });
    await this.notifyClient(bookingId, booking.clientId);
  }

  async setAvailability(
    providerProfileId: string,
    acceptingBookings: boolean,
  ): Promise<ProviderAvailabilityDto> {
    const updated = await this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: { acceptingBookings },
      select: { acceptingBookings: true },
    });
    return updated;
  }

  /**
   * Accept a smart-match offer for real.
   *
   * The only way to accept one was `POST /v1/dev/simulate/accept-offer`,
   * which 404s when NODE_ENV is production — so in a real deployment smart
   * match could never produce a booking at all.
   */
  async acceptOffer(offerId: string, providerProfileId: string) {
    const offer = await this.requireOwnOffer(offerId, providerProfileId);
    return this.matching.acceptOffer(offer.matchRequestId, providerProfileId);
  }

  async declineOffer(offerId: string, providerProfileId: string): Promise<void> {
    const offer = await this.requireOwnOffer(offerId, providerProfileId);
    await this.prisma.matchOffer.update({
      where: { id: offer.id },
      data: { state: 'declined' },
    });
  }

  private async requireOwnOffer(offerId: string, providerProfileId: string) {
    const offer = await this.prisma.matchOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.providerId !== providerProfileId) throw new ForbiddenException();
    if (offer.state !== 'offered') {
      throw new BadRequestException(`This offer is already ${offer.state}`);
    }
    if (offer.respondBy.getTime() < Date.now()) {
      throw new BadRequestException('This offer has expired');
    }
    return offer;
  }

  private async requireOwnBooking(bookingId: string, providerProfileId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.providerId !== providerProfileId) throw new ForbiddenException();
    return booking;
  }

  /** The client's Bookings screen listens for this, so their view updates without a refresh. */
  private async notifyClient(bookingId: string, clientId: string): Promise<void> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { provider: true, service: true },
    });
    const alreadyRated = await this.prisma.review.findFirst({
      where: { bookingId, raterId: clientId },
      select: { id: true },
    });
    this.socketEmitter.emitToUser(
      clientId,
      'booking.updated',
      toBookingRowDto(booking, !!alreadyRated),
    );
  }

  /**
   * The provider side of the same Payment ledger every escrow movement in
   * this codebase writes to. `releasedUsdCents` is what has actually
   * settled (net of the platform fee); `pendingUsdCents` is still held —
   * work in progress, not a payout yet. Refunded/failed entries count
   * toward neither total but still appear in the list, since a stylist
   * needs to see a refund happened, not just that it isn't money for them.
   */
  async getEarnings(providerProfileId: string): Promise<ProviderEarningsDto> {
    const payments = await this.prisma.payment.findMany({
      where: {
        OR: [
          { booking: { providerId: providerProfileId } },
          { order: { providerId: providerProfileId } },
        ],
      },
      include: {
        booking: { include: { client: true } },
        order: { include: { buyer: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let releasedUsdCents = 0;
    let pendingUsdCents = 0;

    const entries: ProviderEarningsEntryDto[] = payments.map((payment) => {
      if (payment.status === 'released') {
        releasedUsdCents += payment.amountUsdCents - payment.feeUsdCents;
      } else if (payment.status === 'held') {
        pendingUsdCents += payment.amountUsdCents;
      }

      return {
        id: payment.id,
        reference: payment.booking?.reference ?? payment.order?.reference ?? '',
        kind: payment.bookingId ? 'booking' : 'order',
        counterpartyName:
          payment.booking?.client.displayName ?? payment.order?.buyer.displayName ?? '',
        amountUsdCents: payment.amountUsdCents,
        feeUsdCents: payment.feeUsdCents,
        status: payment.status as ProviderEarningsEntryDto['status'],
        createdAt: payment.createdAt.toISOString(),
      };
    });

    return { releasedUsdCents, pendingUsdCents, entries };
  }

  /** Append-only, same as every other escrow movement in this codebase. */
  private async refundIfHeld(bookingId: string): Promise<void> {
    const held = await this.prisma.payment.findFirst({
      where: { bookingId, status: 'held' },
      orderBy: { createdAt: 'desc' },
    });
    if (!held) return;

    await this.prisma.payment.create({
      data: {
        bookingId,
        provider: held.provider,
        status: 'refunded',
        amountUsdCents: held.amountUsdCents,
        // Declined work delivers nothing, so the platform keeps nothing.
        feeUsdCents: 0,
        externalRef: held.externalRef,
      },
    });
  }
}

/**
 * Straight-line distance between the stylist and where the client asked from.
 *
 * Done in JS rather than PostGIS because a MatchRequest's coordinates are
 * plain columns with no geography index — this is one row per offer on a
 * screen that shows a handful, not a query that needs to scale.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}
