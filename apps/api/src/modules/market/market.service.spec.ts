import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentStatusService } from '../payments/payment-status.service';
import type { PushService } from '../notifications/push.service';
import type { FeeLedgerService } from '../fees/fee-ledger.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { MarketService } from './market.service';

/** Builds the service with inert collaborators unless a test overrides one. */
function buildService(
  prisma: unknown,
  overrides: { push?: unknown; rewards?: unknown; standing?: unknown } = {},
): MarketService {
  return new MarketService(
    prisma as PrismaService,
    {} as PaymentStatusService,
    (overrides.push ?? { sendToUser: vi.fn() }) as PushService,
    { chargeOrder: vi.fn() } as unknown as FeeLedgerService,
    (overrides.standing ?? new FeeStandingService()) as FeeStandingService,
    (overrides.rewards ?? new RewardsHooksService()) as RewardsHooksService,
  );
}

describe('MarketService order transitions', () => {
  it('returns the original checkout on retry without reserving stock again', async () => {
    const input = {
      providerId: 'seller-1',
      checkoutKey: 'stable-checkout-key',
      items: [{ productId: 'product-1', quantity: 2 }],
    };
    const previous = {
      id: 'order-1',
      reference: 'ORD-1',
      totalUsdCents: 200,
      deliveryChargeUsdCents: 0,
      coinsValueUsdCents: 0,
      checkoutFingerprint: JSON.stringify({
        providerId: input.providerId,
        fulfilment: 'collection',
        deliveryAddress: null,
        coins: 0,
        items: input.items,
      }),
    };
    const transaction = {
      $executeRaw: vi.fn(() => Promise.resolve(1)),
      $queryRaw: vi.fn(() => Promise.resolve([])),
      order: { findUnique: vi.fn(() => Promise.resolve(previous)) },
      product: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((run: (tx: typeof transaction) => Promise<unknown>) => run(transaction)),
    };
    const push = { sendToUser: vi.fn() };
    const service = buildService(prisma, { push });

    await expect(service.createOrder('buyer-1', input)).resolves.toEqual({
      id: previous.id,
      reference: previous.reference,
      totalUsdCents: previous.totalUsdCents,
      deliveryChargeUsdCents: 0,
      coinsValueUsdCents: 0,
      amountDueUsdCents: 200,
    });
    expect(transaction.product.update).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
    await expect(
      service.createOrder('buyer-1', {
        ...input,
        items: [{ productId: 'product-1', quantity: 3 }],
      }),
    ).rejects.toThrow('This checkout was changed');
  });

  it('refuses a seller buying their own products, before touching stock', async () => {
    const transaction = {
      $executeRaw: vi.fn(() => Promise.resolve(1)),
      $queryRaw: vi.fn(() => Promise.resolve([])),
      order: { findUnique: vi.fn(() => Promise.resolve(null)) },
      providerProfile: {
        findUnique: vi.fn(() =>
          Promise.resolve({ userId: 'seller-user', vendor: { status: 'approved' } }),
        ),
      },
      product: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((run: (tx: typeof transaction) => Promise<unknown>) => run(transaction)),
    };
    const service = buildService(prisma);

    await expect(
      service.createOrder('seller-user', {
        providerId: 'seller-1',
        checkoutKey: 'own-stock-checkout',
        items: [{ productId: 'product-1', quantity: 1 }],
      }),
    ).rejects.toThrow("You can't buy your own products");
    expect(transaction.product.update).not.toHaveBeenCalled();
  });

  it('restores stock once when two cancellation requests race', async () => {
    let status: 'reserved' | 'cancelled' = 'reserved';
    let stock = 0;
    let initialReads = 0;
    let releaseReads: () => void = vi.fn();
    const bothStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const item = { productId: 'product-1', nameSnapshot: 'Hair', priceUsdCents: 100, quantity: 1 };
    const provider = {
      displayName: 'Seller',
      tint: '#000',
      initials: 'S',
      profileImageUrl: null,
      portfolioImageUrls: [],
      areaName: 'Harare',
      workingHoursLabel: 'Weekdays',
      latitude: -17.8,
      longitude: 31.0,
    };
    const order = {
      id: 'order-1',
      buyerId: 'buyer-1',
      providerId: 'seller-1',
      reference: 'ORD-1',
      paymentMethod: 'cash',
      totalUsdCents: 100,
      fulfilment: 'collection',
      deliveryAddress: null,
      deliveryChargeUsdCents: 0,
      coinsUsed: 0,
      coinsValueUsdCents: 0,
      createdAt: new Date(),
      pickupAddress: 'Harare',
      pickupHours: 'Weekdays',
      pickupLat: -17.8,
      pickupLng: 31.0,
      pickupNote: null,
    };
    const transaction = {
      order: {
        updateMany: vi.fn(() => {
          if (status !== 'reserved') return Promise.resolve({ count: 0 });
          status = 'cancelled';
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...order, status })),
      },
      orderItem: { findMany: vi.fn(() => Promise.resolve([item])) },
      payment: { findFirst: vi.fn(() => Promise.resolve(null)) },
      product: {
        update: vi.fn(() => {
          stock += item.quantity;
          return Promise.resolve();
        }),
      },
    };
    const prisma = {
      order: {
        findUnique: vi.fn(async () => {
          const snapshot = { ...order, status };
          initialReads += 1;
          if (initialReads === 2) releaseReads();
          if (initialReads <= 2) await bothStarted;
          return snapshot;
        }),
        findUniqueOrThrow: vi.fn(() =>
          Promise.resolve({
            ...order,
            status,
            provider,
            items: [item],
            productReviews: [],
          }),
        ),
      },
      $transaction: vi.fn((run: (tx: typeof transaction) => Promise<unknown>) => run(transaction)),
    };
    const service = buildService(prisma);

    const results = await Promise.all([
      service.cancelOrder(order.id, order.buyerId),
      service.cancelOrder(order.id, order.buyerId),
    ]);

    expect(results.map((result) => result.status)).toEqual(['cancelled', 'cancelled']);
    expect(stock).toBe(1);
    expect(transaction.product.update).toHaveBeenCalledTimes(1);
  });
});
