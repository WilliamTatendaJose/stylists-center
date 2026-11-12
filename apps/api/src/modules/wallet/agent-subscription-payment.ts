import { NotFoundException } from '@nestjs/common';
import {
  isSubscriptionActive,
  nextSubscriptionPaidUntil,
  type AgentSubscriptionDto,
} from '@sc/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { awardRecruitmentReward } from '../rewards/recruitment';
import { settingsFor } from '../settings/settings.service';

interface RecordAgentSubscriptionStatusInput {
  agentId: string;
  reference: string;
  status: string;
  externalRef?: string;
}

const FINAL_FAILURE_STATUSES = new Set(['failed', 'refunded', 'disputed']);

/**
 * Records a gateway verdict on an agent's subscription payment and, when it
 * is `paid`, extends their cover as one atomic action. Written for agents
 * only; the same shape as the stylist version it replaces.
 *
 * Paynow can deliver the same verdict by polling and by callback. The
 * advisory lock serialises them by reference, and matching the exact
 * reference stops an old callback applying to a newer renewal attempt.
 *
 * The first paid subscription may also complete a recruit's qualification
 * (verified AND paid), so the recruiter's reward is attempted in the same
 * transaction.
 */
export async function recordAgentSubscriptionPaymentStatus(
  prisma: PrismaService,
  input: RecordAgentSubscriptionStatusInput,
): Promise<{ status: string; changed: boolean }> {
  // Read before the transaction so the settings query doesn't hold it open.
  const settings = await settingsFor(prisma).all();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reference}))`;

    const prior = await tx.payment.findFirst({
      where: { agentId: input.agentId, reference: input.reference },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) throw new NotFoundException('No agent subscription payment was initiated');

    if (
      prior.status === input.status ||
      FINAL_FAILURE_STATUSES.has(prior.status) ||
      (prior.status === 'paid' && (input.status === 'pending' || input.status === 'held'))
    ) {
      return { status: prior.status, changed: false };
    }

    await tx.payment.create({
      data: {
        agentId: input.agentId,
        provider: prior.provider,
        status: input.status,
        amountUsdCents: prior.amountUsdCents,
        feeUsdCents: 0,
        externalRef: input.externalRef ?? prior.externalRef,
        reference: input.reference,
        channel: prior.channel,
      },
    });

    if (input.status === 'paid') {
      const agent = await tx.agent.findUniqueOrThrow({
        where: { id: input.agentId },
        select: { subscriptionPaidUntil: true, userId: true },
      });
      await tx.agent.update({
        where: { id: input.agentId },
        data: {
          subscriptionPaidUntil: nextSubscriptionPaidUntil(
            agent.subscriptionPaidUntil?.toISOString() ?? null,
            Date.now(),
            settings.subscriptionCycleDays,
          ),
        },
      });
      await awardRecruitmentReward(tx, agent.userId, settings.coinUsdCents);
    }

    return { status: input.status, changed: true };
  });
}

export function toAgentSubscriptionDto(
  paidUntil: Date | null,
  settings: { subscriptionPriceUsdCents: number; subscriptionCycleDays: number },
): AgentSubscriptionDto {
  const iso = paidUntil?.toISOString() ?? null;
  return {
    priceUsdCents: settings.subscriptionPriceUsdCents,
    cycleDays: settings.subscriptionCycleDays,
    paidUntil: iso,
    active: isSubscriptionActive(iso),
  };
}
