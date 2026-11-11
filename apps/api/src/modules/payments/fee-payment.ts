import { NotFoundException } from '@nestjs/common';
import type { FeeLedgerService } from '../fees/fee-ledger.service';
import type { PrismaService } from '../prisma/prisma.service';

interface RecordFeeStatusInput {
  providerId: string;
  reference: string;
  status: string;
  externalRef?: string;
}

const FINAL_FAILURE_STATUSES = new Set(['failed', 'refunded', 'disputed']);

/**
 * Records a gateway verdict on a fee payment and, if it is 'paid', credits
 * the provider's fee balance, as one atomic action.
 *
 * Paynow can deliver the same verdict through both polling and its callback.
 * The transaction-scoped advisory lock serializes the two paths by checkout
 * reference, and a payment that has already reached a final status is left
 * alone, so the ledger is credited exactly once. The exact-reference lookup
 * also stops an old callback being applied to a newer attempt.
 *
 * A 'refunded' or 'disputed' verdict arriving after 'paid' is not applied
 * (the first verdict wins): taking money back from a balance is a decision
 * for staff, who can record an adjustment.
 */
export async function recordFeePaymentStatus(
  prisma: PrismaService,
  ledger: FeeLedgerService,
  input: RecordFeeStatusInput,
): Promise<{ status: string; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reference}))`;

    const prior = await tx.payment.findFirst({
      where: { feeProviderId: input.providerId, reference: input.reference },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) throw new NotFoundException('No fee payment was initiated');

    if (
      prior.status === input.status ||
      prior.status === 'paid' ||
      FINAL_FAILURE_STATUSES.has(prior.status)
    ) {
      return { status: prior.status, changed: false };
    }

    const row = await tx.payment.create({
      data: {
        feeProviderId: input.providerId,
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
      await ledger.recordPayment(tx, {
        providerId: input.providerId,
        amountUsdCents: prior.amountUsdCents,
        paymentId: row.id,
      });
    }

    return { status: input.status, changed: true };
  });
}
