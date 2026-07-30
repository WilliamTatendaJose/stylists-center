import type { MatchOfferDto, MatchRequestDto } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared by MatchingService and the realtime gateway's `match.subscribe`
 * handler — kept as a plain function (not an injectable) specifically so the
 * realtime module can shape a MatchRequestDto without importing anything
 * from the matching module's providers, which would create a circular
 * module dependency (matching needs realtime's SocketEmitterService too).
 */
export async function getMatchRequestDto(
  prisma: PrismaService,
  matchId: string,
): Promise<MatchRequestDto | null> {
  const match = await prisma.matchRequest.findUnique({
    where: { id: matchId },
    include: {
      offers: {
        where: { state: 'accepted' },
        include: { provider: true },
      },
    },
  });
  if (!match) return null;

  const offers: MatchOfferDto[] = match.offers.map((offer) => ({
    id: offer.id,
    providerId: offer.providerId,
    displayName: offer.provider.displayName,
    tint: offer.provider.tint,
    initials: offer.provider.initials,
    verified: offer.provider.verified,
    ratingAvg: offer.provider.ratingAvg,
    completedCount: offer.provider.completedCount,
    quoteUsdCents: offer.quoteUsdCents,
  }));

  return {
    id: match.id,
    state: match.state,
    attempt: match.attempt,
    radiusKm: match.radiusKm,
    budget:
      match.budgetMode === 'fixed'
        ? { mode: 'fixed', amountUsd: (match.budgetAmountUsdCents ?? 0) / 100 }
        : { mode: 'flex' },
    expiresAt: match.expiresAt.toISOString(),
    fanOutCount: match.fanOutCount,
    offers,
  };
}
