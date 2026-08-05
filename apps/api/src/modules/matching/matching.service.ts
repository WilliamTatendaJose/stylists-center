import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  canRetry,
  canTransition,
  formatBudgetLabel,
  MATCH_REQUEST_TTL_SECONDS,
  nextMatchRadiusKm,
  OFFER_RESPONSE_TTL_SECONDS,
  type CreateMatchRequestInput,
  type CreateMatchRequestResponse,
  type MatchOfferDto,
  type MatchRequestDto,
  type MatchState,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeoRepository } from '../geo/geo.repository';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { MATCHING_QUEUE } from '../jobs/jobs.module';
import { getMatchRequestDto } from './mappers';

// BullMQ rejects ':' in custom job ids (it's reserved for its own Redis key
// namespacing), so these use '-' instead of the plan's illustrative
// "match-expire:{id}" notation.
function expireJobId(matchId: string): string {
  return `match-expire-${matchId}`;
}

function offerTimeoutJobId(offerId: string): string {
  return `offer-timeout-${offerId}`;
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
    private readonly socketEmitter: SocketEmitterService,
    @InjectQueue(MATCHING_QUEUE) private readonly queue: Queue,
  ) {}

  async createMatch(
    clientId: string,
    input: CreateMatchRequestInput,
  ): Promise<CreateMatchRequestResponse> {
    const expiresAt = new Date(Date.now() + MATCH_REQUEST_TTL_SECONDS * 1000);

    const match = await this.prisma.matchRequest.create({
      data: {
        clientId,
        categoryId: input.categoryId,
        budgetMode: input.budget.mode,
        budgetAmountUsdCents:
          input.budget.mode === 'fixed' ? Math.round(input.budget.amountUsd * 100) : null,
        radiusKm: input.radiusKm,
        latitude: input.location.lat,
        longitude: input.location.lng,
        state: 'pending',
        attempt: 1,
        expiresAt,
      },
    });

    await this.fanOut(match.id);

    const updated = await this.prisma.matchRequest.findUniqueOrThrow({ where: { id: match.id } });
    return {
      id: updated.id,
      state: updated.state,
      expiresAt: updated.expiresAt.toISOString(),
      fanOutCount: updated.fanOutCount,
    };
  }

  /** Runs the fan-out for whatever the MatchRequest row currently says (used by both create and retry). */
  private async fanOut(matchId: string): Promise<void> {
    const match = await this.prisma.matchRequest.findUniqueOrThrow({ where: { id: matchId } });

    const providers = await this.geo.findProvidersWithinRadius({
      lat: match.latitude,
      lng: match.longitude,
      radiusKm: match.radiusKm,
      categoryId: match.categoryId,
      // Fanning a request out to someone who has switched off is how a match
      // ends in silence and a five-minute expiry for the client.
      onlyAcceptingBookings: true,
    });

    const respondBy = new Date(Date.now() + OFFER_RESPONSE_TTL_SECONDS * 1000);
    const offers = await Promise.all(
      providers.map((p) =>
        this.prisma.matchOffer.create({
          data: {
            matchRequestId: matchId,
            providerId: p.id,
            state: 'offered',
            quoteUsdCents:
              p.priceDisplay === 'from'
                ? (p.fromPriceUsdCents ?? 0)
                : (p.minServicePriceUsdCents ?? 0),
            respondBy,
          },
        }),
      ),
    );

    await this.prisma.matchRequest.update({
      where: { id: matchId },
      data: { state: 'offered', fanOutCount: providers.length },
    });

    await this.queue.add(
      'expire',
      { matchId },
      { delay: MATCH_REQUEST_TTL_SECONDS * 1000, jobId: expireJobId(matchId) },
    );
    for (const offer of offers) {
      await this.queue.add(
        'offerTimeout',
        { offerId: offer.id },
        { delay: OFFER_RESPONSE_TTL_SECONDS * 1000, jobId: offerTimeoutJobId(offer.id) },
      );
    }

    if (providers.length > 0) {
      const category = await this.prisma.category.findUnique({ where: { id: match.categoryId } });
      const label = formatBudgetLabel(
        match.budgetMode === 'fixed'
          ? { mode: 'fixed', amountUsd: (match.budgetAmountUsdCents ?? 0) / 100 }
          : { mode: 'flex' },
      );
      for (const provider of providers) {
        const profile = await this.prisma.providerProfile.findUnique({
          where: { id: provider.id },
        });
        if (!profile) continue;
        this.socketEmitter.emitToUser(profile.userId, 'match.offered', {
          matchId,
          categoryName: category?.name ?? '',
          budgetLabel: label,
        });
      }
    }
  }

  async getMatch(matchId: string): Promise<MatchRequestDto> {
    const dto = await getMatchRequestDto(this.prisma, matchId);
    if (!dto) throw new NotFoundException('Match not found');
    return dto;
  }

  async retry(matchId: string, clientId: string): Promise<CreateMatchRequestResponse> {
    const match = await this.prisma.matchRequest.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.clientId !== clientId) throw new ForbiddenException();
    if (match.state !== 'expired') {
      throw new BadRequestException('Only an expired match can be retried');
    }
    if (!canRetry(match.attempt)) {
      throw new BadRequestException('No attempts remaining — try again later instead');
    }

    const next = nextMatchRadiusKm(match.radiusKm, match.attempt);
    if (!next) {
      throw new BadRequestException('No attempts remaining — try again later instead');
    }

    const expiresAt = new Date(Date.now() + MATCH_REQUEST_TTL_SECONDS * 1000);
    await this.prisma.matchRequest.update({
      where: { id: matchId },
      data: {
        attempt: match.attempt + 1,
        radiusKm: next,
        budgetMode: 'flex',
        budgetAmountUsdCents: null,
        state: 'pending',
        expiresAt,
        fanOutCount: 0,
      },
    });

    // The previous attempt's MatchOffer rows are expired-attempt history —
    // Booking references matchRequestId, never matchOfferId, so nothing is
    // orphaned — and must be cleared before re-fanning-out, since a wider
    // radius still includes the same providers and would otherwise collide
    // with the @@unique([matchRequestId, providerId]) constraint.
    await this.prisma.matchOffer.deleteMany({ where: { matchRequestId: matchId } });

    await this.fanOut(matchId);

    const updated = await this.prisma.matchRequest.findUniqueOrThrow({ where: { id: matchId } });
    return {
      id: updated.id,
      state: updated.state,
      expiresAt: updated.expiresAt.toISOString(),
      fanOutCount: updated.fanOutCount,
    };
  }

  async cancel(matchId: string, clientId: string): Promise<void> {
    const match = await this.prisma.matchRequest.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.clientId !== clientId) throw new ForbiddenException();
    if (!canTransition(match.state, 'declined')) {
      throw new BadRequestException(`Cannot cancel a match in state "${match.state}"`);
    }

    await this.prisma.$transaction([
      this.prisma.matchRequest.update({ where: { id: matchId }, data: { state: 'declined' } }),
      this.prisma.matchOffer.updateMany({
        where: { matchRequestId: matchId, state: { in: ['offered', 'accepted'] } },
        data: { state: 'declined' },
      }),
    ]);

    await this.removeJob(expireJobId(matchId));
    this.socketEmitter.emitToMatch(matchId, 'match.cancelled', { matchId });
  }

  /**
   * Idempotent — re-reads the row and no-ops if it already advanced past
   * pending/offered (plan §6). A restart-while-pending job still fires at
   * the original delay, since BullMQ persists it in Redis.
   */
  async handleMatchExpiry(matchId: string): Promise<void> {
    const match = await this.prisma.matchRequest.findUnique({ where: { id: matchId } });
    if (!match || !canTransition(match.state, 'expired')) return;

    await this.prisma.$transaction([
      this.prisma.matchRequest.update({ where: { id: matchId }, data: { state: 'expired' } }),
      this.prisma.matchOffer.updateMany({
        where: { matchRequestId: matchId, state: { in: ['offered', 'accepted'] } },
        data: { state: 'expired' },
      }),
    ]);

    this.socketEmitter.emitToMatch(matchId, 'match.expired', { matchId, attempt: match.attempt });
  }

  /** A provider who didn't respond within the offer window is never rung again for this request — the parent match is untouched. */
  async handleOfferTimeout(offerId: string): Promise<void> {
    const offer = await this.prisma.matchOffer.findUnique({ where: { id: offerId } });
    if (offer?.state !== 'offered') return;
    await this.prisma.matchOffer.update({ where: { id: offerId }, data: { state: 'expired' } });
  }

  /**
   * A stylist accepting one of their smart-match offers. Called by
   * ProviderService with a real, ownership-checked providerId — the
   * `providerId` parameter is optional only because this also backs the
   * matching integration specs, which accept whichever provider offered
   * first rather than naming one.
   */
  async acceptOffer(matchId: string, providerId?: string): Promise<MatchOfferDto> {
    const offer = await this.prisma.matchOffer.findFirst({
      where: { matchRequestId: matchId, state: 'offered', ...(providerId ? { providerId } : {}) },
      include: { provider: true },
    });
    if (!offer) throw new NotFoundException('No pending offer to accept for this match');

    const match = await this.prisma.matchRequest.findUniqueOrThrow({ where: { id: matchId } });

    await this.prisma.matchOffer.update({ where: { id: offer.id }, data: { state: 'accepted' } });
    if (match.state === 'pending' || match.state === 'offered') {
      await this.prisma.matchRequest.update({
        where: { id: matchId },
        data: { state: 'accepted' },
      });
    }

    const dto: MatchOfferDto = {
      id: offer.id,
      providerId: offer.providerId,
      displayName: offer.provider.displayName,
      tint: offer.provider.tint,
      initials: offer.provider.initials,
      verified: offer.provider.verified,
      ratingAvg: offer.provider.ratingAvg,
      completedCount: offer.provider.completedCount,
      quoteUsdCents: offer.quoteUsdCents,
    };

    this.socketEmitter.emitToMatch(matchId, 'match.offer.accepted', dto);
    return dto;
  }

  /**
   * Called by BookingsService when a booking is created from an accepted
   * offer. `SELECT ... FOR UPDATE` locks the MatchRequest row so two
   * concurrent booking attempts against the same match can't both win — the
   * double-booking race plan §6 calls out — then transitions the match to
   * 'confirmed' and declines every sibling accepted offer, removing their
   * timeout jobs and notifying those providers via `match.offer.superseded`.
   */
  async confirmForBooking(matchId: string, clientId: string, providerId: string): Promise<void> {
    const siblingsToNotify = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string; clientId: string; state: MatchState }[]>`
        SELECT id, "clientId", state FROM "MatchRequest" WHERE id = ${matchId} FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Match not found');
      if (locked.clientId !== clientId) throw new ForbiddenException();
      if (!canTransition(locked.state, 'confirmed')) {
        throw new BadRequestException(`Cannot confirm a match in state "${locked.state}"`);
      }

      const winningOffer = await tx.matchOffer.findFirst({
        where: { matchRequestId: matchId, providerId, state: 'accepted' },
      });
      if (!winningOffer) {
        throw new BadRequestException('No accepted offer from this provider for this match');
      }

      const siblings = await tx.matchOffer.findMany({
        where: { matchRequestId: matchId, state: 'accepted', id: { not: winningOffer.id } },
      });

      await tx.matchRequest.update({ where: { id: matchId }, data: { state: 'confirmed' } });
      if (siblings.length > 0) {
        await tx.matchOffer.updateMany({
          where: { id: { in: siblings.map((s) => s.id) } },
          data: { state: 'declined' },
        });
      }

      return siblings;
    });

    await this.removeJob(expireJobId(matchId));
    for (const sibling of siblingsToNotify) {
      await this.removeJob(offerTimeoutJobId(sibling.id));
      this.socketEmitter.emitToMatch(matchId, 'match.offer.superseded', {
        matchId,
        offerId: sibling.id,
      });
    }
  }

  private async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    await job?.remove();
  }
}
