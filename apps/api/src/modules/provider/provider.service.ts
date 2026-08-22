import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canProviderRespond,
  deriveInitials,
  deriveTint,
  formatBookingWhen,
  isSubscriptionActive,
  needsCashReconciliation,
  normalizePhone,
  type BookingStatus,
  type CreateProviderProductInput,
  type UpdateProviderProductInput,
  type CreateProviderServiceInput,
  type PaySubscriptionInput,
  type PaySubscriptionResponse,
  providerOwesCompletion,
  type ProviderAvailabilityDto,
  type ProviderBookingRowDto,
  type ProviderEarningsDto,
  type ProviderEarningsEntryDto,
  type ProviderJobsDto,
  type ProviderOfferDto,
  type ProviderManagementProfileDto,
  type ProviderOrderDto,
  type ProviderProductDto,
  type ProviderSubscriptionDto,
  type ServiceDto,
  type UpdateProviderProfileInput,
  type UpdateProviderServiceInput,
} from '@sc/shared';
import { ConfigService } from '@nestjs/config';
import { Optional } from '@nestjs/common';
import type { Env } from '../../config/env';
import { walletRates } from '../../config/wallet-rates';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PushService } from '../notifications/push.service';
import { MatchingService } from '../matching/matching.service';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../payments/payment-gateway.port';
import { PaymentStatusService } from '../payments/payment-status.service';
import { applySubscriptionPayment } from '../payments/payments.service';
import { toBookingRowDto } from '../bookings/mappers';
import { expireStaleBookingRequests } from '../bookings/booking-expiry';

/** Statuses a stylist still has something to do about, plus recent history for context. */
const VISIBLE_STATUSES = ['awaiting_provider', 'confirmed', 'completed'] as const;

/**
 * What a client is told when a stylist moves their booking.
 *
 * `awaiting_provider` is absent on purpose: that state is the client's own
 * request being created, so notifying them tells them something they just did.
 * A status with no entry here simply sends nothing, which is why this is a
 * lookup rather than a switch with a default.
 */
const BOOKING_STATUS_NOTIFICATION: Partial<Record<BookingStatus, { title: string }>> = {
  confirmed: { title: 'Booking confirmed' },
  declined: { title: 'Booking declined' },
  cancelled: { title: 'Booking cancelled' },
  completed: { title: 'Booking completed' },
};

@Injectable()
export class ProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly matching: MatchingService,
    private readonly push: PushService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
    private readonly paymentStatus: PaymentStatusService,
    @Optional() private readonly config?: ConfigService<Env, true>,
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

  async getProfile(providerProfileId: string): Promise<ProviderManagementProfileDto> {
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      include: { services: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      id: profile.id,
      displayName: profile.displayName,
      areaName: profile.areaName,
      workingHoursLabel: profile.workingHoursLabel,
      lat: profile.latitude,
      lng: profile.longitude,
      profileImageUrl: profile.profileImageUrl,
      portfolioImageUrls: profile.portfolioImageUrls,
      services: profile.services.map(({ id, name, durationMinutes, priceUsdCents, imageUrls }) => ({
        id,
        name,
        durationMinutes,
        priceUsdCents,
        imageUrls,
      })),
    };
  }

  async updateProfile(
    providerProfileId: string,
    input: UpdateProviderProfileInput,
  ): Promise<ProviderManagementProfileDto> {
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { userId: true },
    });
    const tint = deriveTint(input.displayName);
    const initials = deriveInitials(input.displayName);
    await this.prisma.$transaction([
      this.prisma.providerProfile.update({
        where: { id: providerProfileId },
        data: {
          displayName: input.displayName,
          tint,
          initials,
          areaName: input.areaName,
          workingHoursLabel: input.workingHoursLabel,
          latitude: input.lat,
          longitude: input.lng,
          ...(input.profileImageUrl !== undefined
            ? { profileImageUrl: input.profileImageUrl }
            : {}),
          ...(input.portfolioImageUrls ? { portfolioImageUrls: input.portfolioImageUrls } : {}),
        },
      }),
      this.prisma.user.update({
        where: { id: profile.userId },
        data: { displayName: input.displayName },
      }),
    ]);
    return this.getProfile(providerProfileId);
  }

  async addService(
    providerProfileId: string,
    input: CreateProviderServiceInput,
  ): Promise<ServiceDto> {
    const current = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { fromPriceUsdCents: true },
    });
    const [service] = await this.prisma.$transaction([
      this.prisma.service.create({ data: { providerId: providerProfileId, ...input } }),
      this.prisma.providerProfile.update({
        where: { id: providerProfileId },
        data: {
          fromPriceUsdCents: Math.min(
            current.fromPriceUsdCents ?? input.priceUsdCents,
            input.priceUsdCents,
          ),
        },
      }),
    ]);
    return {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceUsdCents: service.priceUsdCents,
      imageUrls: service.imageUrls,
    };
  }

  async updateService(
    serviceId: string,
    providerProfileId: string,
    input: UpdateProviderServiceInput,
  ): Promise<ServiceDto> {
    const existing = await this.prisma.service.findFirst({
      where: { id: serviceId, providerId: providerProfileId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Service not found');

    const service = await this.prisma.service.update({ where: { id: serviceId }, data: input });
    const cheapest = await this.prisma.service.aggregate({
      where: { providerId: providerProfileId },
      _min: { priceUsdCents: true },
    });
    await this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: { fromPriceUsdCents: cheapest._min.priceUsdCents },
    });
    return {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceUsdCents: service.priceUsdCents,
      imageUrls: service.imageUrls,
    };
  }

  async getProducts(providerProfileId: string): Promise<ProviderProductDto[]> {
    const products = await this.prisma.product.findMany({
      where: { providerId: providerProfileId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map(
      ({ id, name, description, priceUsdCents, stockQty, imageUrls, active }) => ({
        id,
        name,
        description,
        priceUsdCents,
        stockQty,
        imageUrls,
        active,
      }),
    );
  }

  async createProduct(
    providerProfileId: string,
    input: CreateProviderProductInput,
  ): Promise<ProviderProductDto> {
    return this.prisma.product.create({ data: { providerId: providerProfileId, ...input } });
  }

  async updateProduct(
    productId: string,
    providerProfileId: string,
    input: UpdateProviderProductInput,
  ): Promise<ProviderProductDto> {
    await this.requireOwnProduct(productId, providerProfileId);
    return this.prisma.product.update({ where: { id: productId }, data: input });
  }

  async restockProduct(
    productId: string,
    providerProfileId: string,
    quantity: number,
  ): Promise<ProviderProductDto> {
    await this.requireOwnProduct(productId, providerProfileId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { stockQty: { increment: quantity }, active: true },
    });
  }

  async deleteProduct(productId: string, providerProfileId: string): Promise<void> {
    await this.requireOwnProduct(productId, providerProfileId);
    await this.prisma.product.update({ where: { id: productId }, data: { active: false } });
  }

  async getOrders(providerProfileId: string): Promise<ProviderOrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { providerId: providerProfileId },
      include: { buyer: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => ({
      id: order.id,
      reference: order.reference,
      buyerName: order.buyer.displayName,
      status: order.status,
      paymentMethod: order.paymentMethod,
      totalUsdCents: order.totalUsdCents,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.nameSnapshot,
        priceUsdCents: item.priceUsdCents,
        quantity: item.quantity,
      })),
      canMarkReady: order.status === 'reserved',
    }));
  }

  /** Seller confirms packing is complete; the buyer still controls final collection and escrow release. */
  async markOrderReady(orderId: string, providerProfileId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.providerId !== providerProfileId) throw new ForbiddenException();
    if (order.status === 'ready_for_collection' || order.status === 'collected') return;
    if (order.status !== 'reserved') {
      throw new BadRequestException(`Cannot prepare an order that is ${order.status}`);
    }

    await this.prisma.order.updateMany({
      where: { id: orderId, providerId: providerProfileId, status: 'reserved' },
      data: { status: 'ready_for_collection' },
    });
  }

  private async listBookings(providerProfileId: string): Promise<ProviderBookingRowDto[]> {
    await expireStaleBookingRequests(this.prisma, { providerId: providerProfileId });
    const bookings = await this.prisma.booking.findMany({
      where: { providerId: providerProfileId, status: { in: [...VISIBLE_STATUSES] } },
      include: { client: { include: { providerProfile: true } }, service: true },
      orderBy: { startsAt: 'desc' },
      take: 50,
    });

    return bookings.map((b) => {
      const clientImageUrl = b.client.avatarImageUrl ?? b.client.providerProfile?.profileImageUrl;
      return {
        id: b.id,
        reference: b.reference,
        clientName: b.client.displayName,
        ...(clientImageUrl ? { clientImageUrl } : {}),
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
      };
    });
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
    if (booking.status === 'completed') return;
    if (booking.status !== 'confirmed') {
      throw new BadRequestException(`Cannot complete a booking that is ${booking.status}`);
    }
    if (booking.confirmedByProvider) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (current.status === 'completed' || current.confirmedByProvider) return;

      const stillNeedsReconciliation = needsCashReconciliation({
        paymentMethod: current.paymentMethod,
        status: current.status,
        confirmedByClient: current.confirmedByClient,
        confirmedByProvider: true,
      });
      // EcoCash escrow releases on the client's word alone (their own
      // confirmCompletion in bookings.service.ts) — the stylist is never the
      // blocker for it, per providerOwesCompletion. Without the `=== 'cash'`
      // guard, needsCashReconciliation is unconditionally false for EcoCash,
      // so this alone would complete an EcoCash booking on the stylist's
      // confirmation and leave its payment held/paid forever, never released.
      const completes = current.paymentMethod === 'cash' && !stillNeedsReconciliation;

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          confirmedByProvider: true,
          // Completes only once BOTH sides have confirmed a cash job — the
          // stylist saying so alone is exactly the one-sided claim the double
          // confirmation exists to prevent.
          status: completes ? 'completed' : current.status,
        },
      });
      if (completes) {
        await tx.providerProfile.update({
          where: { id: providerProfileId },
          data: { completedCount: { increment: 1 } },
        });
        await tx.payment.create({
          data: {
            bookingId,
            provider: 'cash',
            status: 'released',
            amountUsdCents: current.priceUsdCents,
          },
        });
        const referral = await tx.referral.findFirst({
          where: { referredUserId: current.clientId, status: 'pending' },
          include: { agent: { select: { userId: true } } },
        });
        if (referral) {
          const claimed = await tx.referral.updateMany({
            where: { id: referral.id, status: 'pending' },
            data: { status: 'paid' },
          });
          if (claimed.count === 1) {
            const rates = walletRates(this.config);
            await tx.walletTransaction.create({
              data: {
                userId: referral.agent.userId,
                type: 'referral_coin',
                coins: rates.referralRewardCoins,
                usdCents: rates.referralRewardCoins * rates.coinUsdCents,
                reference: `First completed booking ${current.reference}`,
              },
            });
          }
        }
      }
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

  async getSubscription(providerProfileId: string): Promise<ProviderSubscriptionDto> {
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { subscriptionPriceUsdCents: true, subscriptionPaidUntil: true },
    });
    const paidUntil = profile.subscriptionPaidUntil?.toISOString() ?? null;
    return {
      priceUsdCents: profile.subscriptionPriceUsdCents,
      paidUntil,
      active: isSubscriptionActive(paidUntil),
    };
  }

  /**
   * Creating a checkout only proves that a prompt was sent. The month is
   * credited atomically once Paynow reports `paid`, through either its
   * callback or the provider screen's `subscription/payment-status` poll.
   */
  async paySubscription(
    providerProfileId: string,
    input: PaySubscriptionInput,
  ): Promise<PaySubscriptionResponse> {
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { subscriptionPriceUsdCents: true, subscriptionPaidUntil: true },
    });
    const amountUsdCents = profile.subscriptionPriceUsdCents;
    const currentPaidUntil = profile.subscriptionPaidUntil?.toISOString() ?? null;

    const user = await this.prisma.user.findFirstOrThrow({
      where: { providerProfile: { id: providerProfileId } },
      select: { phone: true },
    });
    // The number the stylist typed, which need not be their login line.
    const payerPhone = input.payerPhone ? normalizePhone(input.payerPhone) : null;
    const paymentPhone = payerPhone ?? user.phone;
    if (!paymentPhone) {
      throw new BadRequestException('Enter the EcoCash phone number for this payment');
    }
    const reference = `SUB-${providerProfileId}-${String(Date.now())}`;
    const intent = await this.paymentGateway.createCheckout({
      reference,
      amountUsdCents,
      description: 'Style Center monthly subscription',
      phone: paymentPhone,
    });
    await this.prisma.payment.create({
      data: {
        subscriptionProviderId: providerProfileId,
        provider: intent.provider,
        status: intent.status,
        amountUsdCents,
        externalRef: intent.externalRef,
        reference,
      },
    });
    // The fake dev adapter settles instantly ('held'); Paynow returns
    // 'pending' and is only credited once a poll or callback confirms it.
    const paidNow = intent.status === 'held';
    return {
      paidUntil: paidNow
        ? await applySubscriptionPayment(this.prisma, providerProfileId)
        : currentPaidUntil,
      pending: !paidNow,
      ...(intent.checkoutUrl ? { checkoutUrl: intent.checkoutUrl } : {}),
      ...(intent.instructions ? { instructions: intent.instructions } : {}),
    };
  }

  /**
   * Polls Paynow for an in-flight subscription payment and credits the month
   * the moment it clears — the provider's screen calls this while waiting on
   * the EcoCash prompt they were just sent.
   */
  async subscriptionPaymentStatus(
    providerProfileId: string,
  ): Promise<{ status: string; paidUntil: string | null; active: boolean }> {
    const result = await this.paymentStatus.resolve({
      subscriptionProviderId: providerProfileId,
    });
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { subscriptionPaidUntil: true },
    });
    const paidUntil = profile.subscriptionPaidUntil?.toISOString() ?? null;
    return { status: result.status, paidUntil, active: isSubscriptionActive(paidUntil) };
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

  private async requireOwnProduct(productId: string, providerProfileId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (product?.providerId !== providerProfileId) {
      throw new NotFoundException('Marketplace item not found');
    }
    return product;
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

    // Every provider-side booking decision funnels through here, so one send
    // covers confirm, decline and completion. The client is waiting on an
    // answer they did not initiate, which is exactly the case a socket cannot
    // serve — they have almost certainly put the phone down.
    const summary = BOOKING_STATUS_NOTIFICATION[booking.status];
    if (summary) {
      void this.push.sendToUser(clientId, {
        title: summary.title,
        body: `${booking.provider.displayName} · ${booking.service.name}`,
        data: { type: 'booking.updated', bookingId },
      });
    }
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

    // The ledger is append-only, so a completed Paynow job has both a held
    // row and a newer released row. Totals describe the current state of
    // each booking/order, not the sum of every historical movement.
    const countedSubjects = new Set<string>();
    const currentPayments: typeof payments = [];
    for (const payment of payments) {
      const subject = payment.bookingId
        ? `booking:${payment.bookingId}`
        : `order:${String(payment.orderId)}`;
      if (countedSubjects.has(subject)) continue;
      countedSubjects.add(subject);
      currentPayments.push(payment);
      if (payment.status === 'released') {
        releasedUsdCents += payment.amountUsdCents - payment.feeUsdCents;
      } else if (['pending', 'paid', 'held', 'disputed'].includes(payment.status)) {
        pendingUsdCents += payment.amountUsdCents;
      }
    }

    // History is a provider-facing statement of where each job/order stands
    // now, not the internal escrow audit trail. Rendering every ledger row
    // made one completed job appear twice as both "In progress" and "Paid
    // out", even though the totals above already treated it as one payout.
    const entries: ProviderEarningsEntryDto[] = currentPayments.map((payment) => {
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
      where: { bookingId, status: { in: ['paid', 'held'] } },
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
