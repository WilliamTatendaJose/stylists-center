import { NotFoundException } from '@nestjs/common';
import { nextSubscriptionPaidUntil } from '@sc/shared';
import type { PrismaService } from '../prisma/prisma.service';

interface RecordSubscriptionStatusInput {
  providerProfileId: string;
  reference: string;
  status: string;
  externalRef?: string;
}

const FINAL_FAILURE_STATUSES = new Set(['failed', 'refunded', 'disputed']);

/**
 * Records a gateway verdict and credits a subscription as one atomic action.
 *
 * Paynow can deliver the same verdict through both polling and its callback.
 * The transaction-scoped advisory lock serializes those two paths by checkout
 * reference, while the exact-reference lookup prevents an old callback from
 * being applied to a provider's newer renewal attempt.
 */
export function recordSubscriptionPaymentStatus(
  prisma: PrismaService,
  input: RecordSubscriptionStatusInput,
): Promise<{ status: string; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reference}))`;

    const prior = await tx.payment.findFirst({
      where: {
        subscriptionProviderId: input.providerProfileId,
        provider: 'paynow',
        reference: input.reference,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) throw new NotFoundException('No Paynow subscription payment was initiated');

    if (
      prior.status === input.status ||
      FINAL_FAILURE_STATUSES.has(prior.status) ||
      (prior.status === 'paid' && (input.status === 'pending' || input.status === 'held'))
    ) {
      return { status: prior.status, changed: false };
    }

    await tx.payment.create({
      data: {
        subscriptionProviderId: input.providerProfileId,
        provider: prior.provider,
        status: input.status,
        amountUsdCents: prior.amountUsdCents,
        feeUsdCents: input.status === 'refunded' ? 0 : prior.feeUsdCents,
        externalRef: input.externalRef ?? prior.externalRef,
        reference: input.reference,
      },
    });

    if (input.status === 'paid') {
      const profile = await tx.providerProfile.findUniqueOrThrow({
        where: { id: input.providerProfileId },
        select: { subscriptionPaidUntil: true },
      });
      const paidUntil = nextSubscriptionPaidUntil(
        profile.subscriptionPaidUntil?.toISOString() ?? null,
      );
      await tx.providerProfile.update({
        where: { id: input.providerProfileId },
        data: { subscriptionPaidUntil: paidUntil },
      });
    }

    return { status: input.status, changed: true };
  });
}
