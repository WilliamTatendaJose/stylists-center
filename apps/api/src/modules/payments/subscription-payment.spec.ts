import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { recordSubscriptionPaymentStatus } from './subscription-payment';

describe('recordSubscriptionPaymentStatus', () => {
  it('credits one month once for one exact Paynow checkout reference', async () => {
    const providerProfileId = 'provider-1';
    const reference = 'SUB-provider-1-123';
    let latestStatus = 'pending';
    const payment = {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { reference: string } }) =>
        Promise.resolve(
          where.reference === reference
            ? {
                provider: 'paynow',
                status: latestStatus,
                amountUsdCents: 500,
                feeUsdCents: 0,
                externalRef: 'poll-url',
              }
            : null,
        ),
      ),
      create: vi.fn().mockImplementation(({ data }: { data: { status: string } }) => {
        latestStatus = data.status;
        return Promise.resolve(data);
      }),
    };
    const providerProfile = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ subscriptionPaidUntil: null }),
      update: vi.fn().mockResolvedValue({}),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      payment,
      providerProfile,
    };
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((run: (tx: typeof transaction) => Promise<unknown>) =>
          run(transaction),
        ),
    } as unknown as PrismaService;

    const first = await recordSubscriptionPaymentStatus(prisma, {
      providerProfileId,
      reference,
      status: 'paid',
    });
    const duplicate = await recordSubscriptionPaymentStatus(prisma, {
      providerProfileId,
      reference,
      status: 'paid',
    });

    expect(first).toEqual({ status: 'paid', changed: true });
    expect(duplicate).toEqual({ status: 'paid', changed: false });
    expect(payment.findFirst).toHaveBeenCalledWith({
      where: { subscriptionProviderId: providerProfileId, provider: 'paynow', reference },
      orderBy: { createdAt: 'desc' },
    });
    expect(payment.create).toHaveBeenCalledTimes(1);
    expect(providerProfile.update).toHaveBeenCalledTimes(1);
  });
});
