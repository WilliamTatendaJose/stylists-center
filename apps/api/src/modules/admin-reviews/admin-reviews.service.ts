import { Injectable } from '@nestjs/common';
import type { AdminReviewRowDto } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const PARTY_SELECT = { id: true, displayName: true, phone: true } satisfies Prisma.UserSelect;

const REVIEW_INCLUDE = {
  booking: { select: { reference: true } },
  rater: { select: PARTY_SELECT },
  ratee: { select: PARTY_SELECT },
} satisfies Prisma.ReviewInclude;

type ReviewWithRelations = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Deleting a review recomputes the ratee's ProviderProfile.ratingAvg the
 * same way bookings.service.ts's submitReview does on create — a plain
 * average over remaining Review rows for that rateeId — so a removed
 * abusive/fake review doesn't leave the provider's rating stuck at the old
 * value.
 */
@Injectable()
export class AdminReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit = DEFAULT_LIMIT): Promise<AdminReviewRowDto[]> {
    const reviews = await this.prisma.review.findMany({
      include: REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, MAX_LIMIT),
    });
    return reviews.map(toRow);
  }

  async delete(id: string): Promise<void> {
    const review = await this.prisma.review.findUniqueOrThrow({ where: { id } });

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });

      const agg = await tx.review.aggregate({
        where: { rateeId: review.rateeId },
        _avg: { rating: true },
      });
      const provider = await tx.providerProfile.findUnique({ where: { userId: review.rateeId } });
      if (provider) {
        await tx.providerProfile.update({
          where: { id: provider.id },
          data: { ratingAvg: agg._avg.rating ?? 0 },
        });
      }
    });
  }
}

function toRow(review: ReviewWithRelations): AdminReviewRowDto {
  return {
    id: review.id,
    bookingReference: review.booking.reference,
    rater: review.rater,
    ratee: review.ratee,
    rating: review.rating,
    text: review.text,
    createdAt: review.createdAt.toISOString(),
  };
}
