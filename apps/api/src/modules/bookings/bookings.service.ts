import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BookingRowDto,
  BookingStatus,
  ConfirmCompletionResponse,
  CreateBookingInput,
  CreateBookingResponse,
  CreateReviewInput,
} from '@sc/shared';
import { formatBookingReference, needsCashReconciliation, platformFeeCents } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { MatchingService } from '../matching/matching.service';
import { PAYMENT_GATEWAY } from '../payments/payments.module';
import type { PaymentGatewayPort } from '../payments/payment-gateway.port';
import { toBookingRowDto } from './mappers';

const NON_BLOCKING_STATUSES = ['cancelled', 'declined'] as const;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly matching: MatchingService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
  ) {}

  async create(clientId: string, input: CreateBookingInput): Promise<CreateBookingResponse> {
    const service = await this.prisma.service.findUnique({
      where: { id: input.serviceId },
      include: { provider: true },
    });
    if (service?.providerId !== input.providerId) {
      throw new NotFoundException('Service not found for this provider');
    }

    const startsAt = new Date(input.startsAt);
    const conflict = await this.prisma.booking.findFirst({
      where: {
        providerId: input.providerId,
        startsAt,
        status: { notIn: [...NON_BLOCKING_STATUSES] },
      },
    });
    if (conflict) throw new BadRequestException('That slot is no longer available');

    // Confirming the match here (not before the conflict check) means a slot
    // race never leaves a MatchRequest confirmed with no resulting booking.
    if (input.matchId) {
      await this.matching.confirmForBooking(input.matchId, clientId, input.providerId);
    }

    const sequence = await this.nextBookingSequence();
    const booking = await this.prisma.booking.create({
      data: {
        reference: formatBookingReference(sequence),
        clientId,
        providerId: input.providerId,
        serviceId: input.serviceId,
        matchRequestId: input.matchId ?? null,
        startsAt,
        paymentMethod: input.paymentMethod,
        priceUsdCents: service.priceUsdCents,
      },
    });

    if (input.paymentMethod === 'ecocash') {
      const intent = await this.paymentGateway.chargeToEscrow(service.priceUsdCents);
      await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          provider: 'ecocash',
          status: intent.status,
          amountUsdCents: service.priceUsdCents,
          feeUsdCents: platformFeeCents(service.priceUsdCents),
          externalRef: intent.externalRef,
        },
      });
    }

    const row = await this.toRowById(booking.id);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);

    return { id: booking.id, reference: booking.reference, status: booking.status };
  }

  async listForClient(clientId: string): Promise<BookingRowDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { clientId },
      include: { provider: true, service: true },
      orderBy: { startsAt: 'desc' },
    });

    const reviewed = await this.prisma.review.findMany({
      where: { raterId: clientId, bookingId: { in: bookings.map((b) => b.id) } },
      select: { bookingId: true },
    });
    const reviewedIds = new Set(reviewed.map((r) => r.bookingId));

    return bookings.map((b) => toBookingRowDto(b, reviewedIds.has(b.id)));
  }

  async confirmCompletion(bookingId: string, clientId: string): Promise<ConfirmCompletionResponse> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();
    // Both the cash and EcoCash happy paths are awaiting_provider -> confirmed
    // -> completed — completion only makes sense once the provider has
    // confirmed the appointment, never while still awaiting them.
    if (booking.status !== 'confirmed') {
      throw new BadRequestException(`Cannot confirm completion for a booking in status "${booking.status}"`);
    }

    if (booking.confirmedByClient) {
      return {
        confirmedByClient: booking.confirmedByClient,
        confirmedByProvider: booking.confirmedByProvider,
        status: booking.status,
      };
    }

    // Cash needs both sides (needsCashReconciliation); EcoCash's escrow is
    // released on the client's word alone — they're the one who received the
    // service, so their confirmation is what the "held until complete" promise
    // (plan R3) actually turns on.
    const stillNeedsReconciliation = needsCashReconciliation({
      paymentMethod: booking.paymentMethod,
      status: booking.status,
      confirmedByClient: true,
      confirmedByProvider: booking.confirmedByProvider,
    });
    const completes = booking.paymentMethod === 'ecocash' || !stillNeedsReconciliation;
    const nextStatus: BookingStatus = completes ? 'completed' : booking.status;

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { confirmedByClient: true, status: nextStatus },
    });

    if (completes && booking.paymentMethod === 'ecocash') {
      await this.releaseEscrow(bookingId);
    }

    const row = await this.toRowById(bookingId);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);

    return {
      confirmedByClient: updated.confirmedByClient,
      confirmedByProvider: updated.confirmedByProvider,
      status: updated.status,
    };
  }

  async createReview(bookingId: string, clientId: string, input: CreateReviewInput): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();
    if (booking.status !== 'completed') {
      throw new BadRequestException('Can only review a completed booking');
    }

    const existing = await this.prisma.review.findFirst({ where: { bookingId, raterId: clientId } });
    if (existing) throw new BadRequestException('Already reviewed this booking');

    const providerUserId = booking.provider.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          bookingId,
          raterId: clientId,
          rateeId: providerUserId,
          rating: input.rating,
          ...(input.text ? { text: input.text } : {}),
        },
      });

      const agg = await tx.review.aggregate({
        where: { rateeId: providerUserId },
        _avg: { rating: true },
      });
      await tx.providerProfile.update({
        where: { id: booking.providerId },
        data: { ratingAvg: agg._avg.rating ?? input.rating },
      });
    });
  }

  /** Append-only ledger (plan §6): a release is a NEW row, never an update of the held one. */
  private async releaseEscrow(bookingId: string): Promise<void> {
    const held = await this.prisma.payment.findFirst({
      where: { bookingId, status: 'held' },
      orderBy: { createdAt: 'desc' },
    });
    if (!held) return;

    await this.prisma.payment.create({
      data: {
        bookingId,
        provider: held.provider,
        status: 'released',
        amountUsdCents: held.amountUsdCents,
        feeUsdCents: held.feeUsdCents,
        externalRef: held.externalRef,
      },
    });
  }

  private async toRowById(bookingId: string): Promise<BookingRowDto> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { provider: true, service: true },
    });
    const alreadyRated = await this.prisma.review.findFirst({
      where: { bookingId, raterId: booking.clientId },
    });
    return toBookingRowDto(booking, !!alreadyRated);
  }

  /** Race-free monotonic counter for the "SC-4471" reference (plan §9 — a real Postgres sequence, not a row count). */
  private async nextBookingSequence(): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('booking_reference_seq')`;
    return Number(row?.nextval ?? 0);
  }
}
