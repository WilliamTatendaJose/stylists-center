import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { PaymentStatusService } from '../payments/payment-status.service';
import { FakeEcoCashAdapter } from '../payments/fake-ecocash.adapter';
import type { PushService } from '../notifications/push.service';
import type { Env } from '../../config/env';
import { MarketService } from './market.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  TRUST_PROXY_HOPS: 1,
  ADMIN_MFA_REQUIRED: false,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  STORAGE_DRIVER: 'local',
  UPLOAD_DIR: 'uploads',
  S3_REGION: 'auto',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-at-least-32-characters-long',
  ADMIN_JWT_REFRESH_PEPPER: 'test-admin-refresh-pepper-at-least-32-characters-long',
  ADMIN_WEB_ORIGIN: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'fake',
  PESEPAY_SANDBOX: false,
  PESEPAY_CURRENCY_CODE: 'USD',
  PESEPAY_MOBILE_METHOD_CODE: 'PZW211',
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
  ANDROID_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=zw.co.stylistscenter.app',
};

const uniquePhone = () => `+263779${String(Math.floor(Math.random() * 900000) + 100000)}`;
let keySeq = 0;
const checkoutKey = (label: string) => `db-${label}-${String(Date.now())}-${String(++keySeq)}`;

/**
 * Real Postgres. The unit spec mocks the transaction client, which is how a
 * query Prisma cannot execute (the checkout lock, issued through $queryRaw)
 * broke every marketplace checkout in production without a failing test.
 */
describe('MarketService against the database', () => {
  let prisma: PrismaService;
  let market: MarketService;
  let fees: FeeLedgerService;
  let standing: FeeStandingService;
  let rewards: RewardsHooksService;
  let cityId: string;
  let categoryId: string;
  let buyerId: string;
  let sellerUserId: string;
  let providerId: string;
  let productId: string;
  const userIds: string[] = [];
  const providerIds: string[] = [];

  const makeUser = async (displayName: string) => {
    const id = (await prisma.user.create({ data: { phone: uniquePhone(), displayName, cityId } }))
      .id;
    userIds.push(id);
    return id;
  };

  const makeVendor = async (
    status: 'pending' | 'approved' | 'rejected' | null,
    extra: { delivers?: boolean; deliveryChargeUsdCents?: number; lat?: number; lng?: number } = {},
  ) => {
    const userId = await makeUser('Shop');
    const profile = await prisma.providerProfile.create({
      data: {
        userId,
        categoryId,
        displayName: 'Shop',
        initials: 'SH',
        tint: '#abc',
        areaName: 'Area',
        latitude: extra.lat ?? -17.8,
        longitude: extra.lng ?? 31.03,
        cityId,
        workingHoursLabel: 'Weekdays',
        offersServices: false,
      },
    });
    providerIds.push(profile.id);
    if (status) {
      await prisma.vendorApplication.create({
        data: {
          providerId: profile.id,
          businessName: 'Shop',
          shopAddress: '1 Test Road',
          contactName: 'Owner',
          contactPhone: '+263771234567',
          status,
          delivers: extra.delivers ?? false,
          deliveryChargeUsdCents: extra.deliveryChargeUsdCents ?? 0,
          deliveryAreas: extra.delivers ? ['Avondale'] : [],
          collectionAddress: '1 Test Road, Avondale',
          collectionHours: 'Mon-Sat 9-5',
        },
      });
    }
    const product = await prisma.product.create({
      data: {
        providerId: profile.id,
        name: 'Wig',
        description: 'Test inventory',
        priceUsdCents: 1000,
        stockQty: 10,
        active: true,
      },
    });
    return { userId, providerId: profile.id, productId: product.id };
  };

  const stock = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty;

  beforeAll(async () => {
    const config = new ConfigService<Env, true>(BASE_ENV);
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const settings = new SettingsService(undefined, {
      MARKETPLACE_FEE_BPS: '300',
    });
    fees = new FeeLedgerService(prisma, settings);
    standing = new FeeStandingService(prisma, settings);
    rewards = new RewardsHooksService(prisma, settings);
    const gateway = new FakeEcoCashAdapter();
    market = new MarketService(
      prisma,
      new PaymentStatusService(prisma, gateway),
      { sendToUser: () => Promise.resolve() } as unknown as PushService,
      fees,
      standing,
      rewards,
      settings,
    );

    const stamp = String(Date.now());
    cityId = (
      await prisma.city.create({
        data: {
          name: `market-db-${stamp}`,
          timezone: 'Africa/Harare',
          centroidLat: -17.8252,
          centroidLng: 31.0335,
          bboxWest: 30.9,
          bboxSouth: -18.0,
          bboxEast: 31.2,
          bboxNorth: -17.6,
        },
      })
    ).id;
    categoryId = (await prisma.category.create({ data: { name: `market-db-cat-${stamp}` } })).id;
    buyerId = await makeUser('Buyer');
    const main = await makeVendor('approved', { delivers: true, deliveryChargeUsdCents: 300 });
    sellerUserId = main.userId;
    providerId = main.providerId;
    productId = main.productId;
    // Plenty of stock: every test below buys from this product.
    await prisma.product.update({ where: { id: productId }, data: { stockQty: 1000 } });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.feeLedgerEntry.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.productReview.deleteMany({
      where: { order: { providerId: { in: providerIds } } },
    });
    await prisma.orderItem.deleteMany({ where: { order: { providerId: { in: providerIds } } } });
    await prisma.order.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.product.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.vendorApplication.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerProfile.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  describe('checkout', () => {
    it('places a pay-on-collection order, holds the stock and creates no payment', async () => {
      const before = await stock(productId);
      const created = await market.createOrder(buyerId, {
        providerId,
        checkoutKey: checkoutKey('collect'),
        items: [{ productId, quantity: 2 }],
      });

      expect(created).toMatchObject({
        totalUsdCents: 2000,
        deliveryChargeUsdCents: 0,
        amountDueUsdCents: 2000,
      });
      expect(await stock(productId)).toBe(before - 2);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      expect(order).toMatchObject({
        paymentMethod: 'cash',
        fulfilment: 'collection',
        // Snapshotted from the vendor's collection settings.
        pickupAddress: '1 Test Road, Avondale',
        pickupHours: 'Mon-Sat 9-5',
      });
      expect(await prisma.payment.count({ where: { orderId: created.id } })).toBe(0);
    });

    it('keeps the delivery charge apart from the product total', async () => {
      const created = await market.createOrder(buyerId, {
        providerId,
        checkoutKey: checkoutKey('deliver'),
        fulfilment: 'delivery',
        deliveryAddress: '12 Samora Machel Ave',
        items: [{ productId, quantity: 1 }],
      });

      expect(created).toMatchObject({
        totalUsdCents: 1000,
        deliveryChargeUsdCents: 300,
        amountDueUsdCents: 1300,
      });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      expect(order).toMatchObject({
        fulfilment: 'delivery',
        deliveryAddress: '12 Samora Machel Ave',
        totalUsdCents: 1000,
        deliveryChargeUsdCents: 300,
      });
    });

    it('refuses delivery from a vendor who does not deliver', async () => {
      const shop = await makeVendor('approved', { delivers: false });
      await expect(
        market.createOrder(buyerId, {
          providerId: shop.providerId,
          checkoutKey: checkoutKey('nodeliver'),
          fulfilment: 'delivery',
          deliveryAddress: '12 Samora Machel Ave',
          items: [{ productId: shop.productId, quantity: 1 }],
        }),
      ).rejects.toThrow("doesn't deliver");
      expect(await stock(shop.productId)).toBe(10);
    });

    it('returns the same order when a checkout is retried, reserving stock once', async () => {
      const key = checkoutKey('retry');
      const input = { providerId, checkoutKey: key, items: [{ productId, quantity: 1 }] };
      const before = await stock(productId);
      const [a, b] = await Promise.all([
        market.createOrder(buyerId, input),
        market.createOrder(buyerId, input),
      ]);
      expect(a.id).toBe(b.id);
      expect(await stock(productId)).toBe(before - 1);
      await expect(
        market.createOrder(buyerId, { ...input, items: [{ productId, quantity: 2 }] }),
      ).rejects.toThrow('This checkout was changed');
    });

    it.each([['pending' as const], ['rejected' as const], [null]])(
      'refuses a shop whose application is %s',
      async (status) => {
        const shop = await makeVendor(status);
        await expect(
          market.createOrder(buyerId, {
            providerId: shop.providerId,
            checkoutKey: checkoutKey('unapproved'),
            items: [{ productId: shop.productId, quantity: 1 }],
          }),
        ).rejects.toThrow("isn't approved");
        expect(await stock(shop.productId)).toBe(10);
      },
    );

    it('refuses a vendor buying their own products', async () => {
      await expect(
        market.createOrder(sellerUserId, {
          providerId,
          checkoutKey: checkoutKey('self'),
          items: [{ productId, quantity: 1 }],
        }),
      ).rejects.toThrow("can't buy your own");
    });

    it('refuses a restricted vendor before reserving any stock', async () => {
      const before = await stock(productId);
      vi.spyOn(standing, 'assertCanTrade').mockRejectedValueOnce(
        new ForbiddenException('This shop is not taking orders right now'),
      );
      await expect(
        market.createOrder(buyerId, {
          providerId,
          checkoutKey: checkoutKey('restricted'),
          items: [{ productId, quantity: 1 }],
        }),
      ).rejects.toThrow('not taking orders');
      expect(await stock(productId)).toBe(before);
    });
  });

  describe('coins', () => {
    it('rolls the whole order back, stock included, when the buyer lacks the coins', async () => {
      const before = await stock(productId);
      const key = checkoutKey('coins-stub');
      await expect(
        market.createOrder(buyerId, {
          providerId,
          checkoutKey: key,
          coins: 10,
          items: [{ productId, quantity: 1 }],
        }),
      ).rejects.toThrow(/Not enough coins/);
      expect(await stock(productId)).toBe(before);
      expect(await prisma.order.count({ where: { buyerId, checkoutKey: key } })).toBe(0);
    });

    it('redeems in the checkout transaction and stores coins and their value', async () => {
      const redeem = vi.spyOn(rewards, 'redeemForOrder').mockResolvedValue({ usdCents: 200 });
      const created = await market.createOrder(buyerId, {
        providerId,
        checkoutKey: checkoutKey('coins'),
        coins: 20,
        items: [{ productId, quantity: 1 }],
      });

      expect(redeem).toHaveBeenCalledWith(expect.anything(), {
        orderId: created.id,
        buyerId,
        vendorUserId: sellerUserId,
        coins: 20,
      });
      expect(created).toMatchObject({
        totalUsdCents: 1000,
        coinsValueUsdCents: 200,
        amountDueUsdCents: 800,
      });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      expect(order).toMatchObject({ coinsUsed: 20, coinsValueUsdCents: 200 });
    });

    it('refuses more coins than the order is worth, without calling the hook', async () => {
      const redeem = vi.spyOn(rewards, 'redeemForOrder').mockResolvedValue({ usdCents: 0 });
      await expect(
        market.createOrder(buyerId, {
          providerId,
          checkoutKey: checkoutKey('coins-max'),
          coins: 101, // 1000 cents at 10 cents a coin is 100 coins at most
          items: [{ productId, quantity: 1 }],
        }),
      ).rejects.toThrow('at most 100 coins');
      expect(redeem).not.toHaveBeenCalled();
    });

    it('gives the coins back when the order is cancelled', async () => {
      vi.spyOn(rewards, 'redeemForOrder').mockResolvedValue({ usdCents: 100 });
      const refund = vi.spyOn(rewards, 'refundRedemption').mockResolvedValue();
      const created = await market.createOrder(buyerId, {
        providerId,
        checkoutKey: checkoutKey('coins-refund'),
        coins: 10,
        items: [{ productId, quantity: 1 }],
      });
      await market.cancelOrder(created.id, buyerId);
      expect(refund).toHaveBeenCalledWith(expect.anything(), { orderId: created.id });
    });

    it('does not touch the rewards hook when cancelling an order that used no coins', async () => {
      const refund = vi.spyOn(rewards, 'refundRedemption').mockResolvedValue();
      const created = await market.createOrder(buyerId, {
        providerId,
        checkoutKey: checkoutKey('nocoins'),
        items: [{ productId, quantity: 1 }],
      });
      await market.cancelOrder(created.id, buyerId);
      expect(refund).not.toHaveBeenCalled();
    });
  });

  describe('fulfilment and commission', () => {
    const place = (fulfilment: 'collection' | 'delivery', quantity = 1) =>
      market.createOrder(buyerId, {
        providerId,
        checkoutKey: checkoutKey(fulfilment),
        fulfilment,
        ...(fulfilment === 'delivery' ? { deliveryAddress: '12 Samora Machel Ave' } : {}),
        items: [{ productId, quantity }],
      });

    it('takes a delivery order from packed to delivered and charges commission on products only', async () => {
      const onCompleted = vi.spyOn(rewards, 'onOrderCompleted').mockResolvedValue();
      const created = await place('delivery', 2);

      const packed = await market.markOrderReady(created.id, providerId);
      expect(packed.status).toBe('out_for_delivery');
      // Out for delivery is not completion: nothing is owed yet.
      expect(await prisma.feeLedgerEntry.count({ where: { orderId: created.id } })).toBe(0);

      const delivered = await market.completeVendorOrder(created.id, providerId);
      expect(delivered.status).toBe('delivered');
      const entries = await prisma.feeLedgerEntry.findMany({ where: { orderId: created.id } });
      expect(entries).toHaveLength(1);
      // 3% of the $20 product total, not of the $23 the buyer paid.
      expect(entries[0]).toMatchObject({
        providerId,
        kind: 'order_fee',
        baseUsdCents: 2000,
        amountUsdCents: 60,
      });
      expect(onCompleted).toHaveBeenCalledWith(expect.anything(), {
        orderId: created.id,
        buyerId,
        productTotalUsdCents: 2000,
      });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      expect(order.completedAt).not.toBeNull();
    });

    it('takes a collection order from packed to collected', async () => {
      const created = await place('collection');
      const packed = await market.markOrderReady(created.id, providerId);
      expect(packed.status).toBe('ready_for_collection');
      const collected = await market.completeVendorOrder(created.id, providerId);
      expect(collected.status).toBe('collected');
      expect(await prisma.feeLedgerEntry.count({ where: { orderId: created.id } })).toBe(1);
    });

    it('lets the vendor hand over straight from "being prepared"', async () => {
      const created = await place('collection');
      const done = await market.completeVendorOrder(created.id, providerId);
      expect(done.status).toBe('collected');
    });

    it('charges and rewards once when the buyer and the vendor confirm at the same time', async () => {
      const onCompleted = vi.spyOn(rewards, 'onOrderCompleted').mockResolvedValue();
      const created = await place('delivery');
      await market.markOrderReady(created.id, providerId);

      await Promise.allSettled([
        market.collectOrder(created.id, buyerId),
        market.completeVendorOrder(created.id, providerId),
        market.collectOrder(created.id, buyerId),
      ]);

      expect(await prisma.feeLedgerEntry.count({ where: { orderId: created.id } })).toBe(1);
      expect(onCompleted).toHaveBeenCalledTimes(1);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      expect(order.status).toBe('delivered');
    });

    it('is a no-op to complete an order twice', async () => {
      const onCompleted = vi.spyOn(rewards, 'onOrderCompleted').mockResolvedValue();
      const created = await place('collection');
      await market.completeVendorOrder(created.id, providerId);
      await market.completeVendorOrder(created.id, providerId);
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(await prisma.feeLedgerEntry.count({ where: { orderId: created.id } })).toBe(1);
    });

    it('rolls the status back if the commission cannot be recorded', async () => {
      vi.spyOn(fees, 'chargeOrder').mockRejectedValueOnce(new Error('ledger down'));
      const created = await place('collection');
      await expect(market.completeVendorOrder(created.id, providerId)).rejects.toThrow(
        'ledger down',
      );
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      expect(order.status).toBe('reserved');
      expect(order.completedAt).toBeNull();
    });

    it('owes no commission on a cancelled order and puts the stock back', async () => {
      const before = await stock(productId);
      const created = await place('delivery', 3);
      expect(await stock(productId)).toBe(before - 3);
      await market.markOrderReady(created.id, providerId);

      // A vendor can still cancel once it is out for delivery; the buyer cannot.
      await expect(market.cancelOrder(created.id, buyerId)).rejects.toThrow('Cannot cancel');
      const cancelled = await market.cancelVendorOrder(created.id, providerId);
      expect(cancelled.status).toBe('cancelled');
      expect(await stock(productId)).toBe(before);
      expect(await prisma.feeLedgerEntry.count({ where: { orderId: created.id } })).toBe(0);
      await expect(market.completeVendorOrder(created.id, providerId)).rejects.toThrow(
        'Cannot complete',
      );
    });

    it('cannot cancel an order that was already handed over', async () => {
      const created = await place('collection');
      await market.completeVendorOrder(created.id, providerId);
      await expect(market.cancelVendorOrder(created.id, providerId)).rejects.toThrow(
        'Cannot cancel',
      );
      await expect(market.cancelOrder(created.id, buyerId)).rejects.toThrow('Cannot cancel');
    });

    it('keeps one shop out of another shop orders', async () => {
      const other = await makeVendor('approved');
      const created = await place('collection');
      await expect(market.markOrderReady(created.id, other.providerId)).rejects.toThrow();
      await expect(market.completeVendorOrder(created.id, other.providerId)).rejects.toThrow();
      await expect(market.cancelVendorOrder(created.id, other.providerId)).rejects.toThrow();
    });

    it('does not let the buyer confirm before the vendor has packed the order', async () => {
      const created = await place('delivery');
      await expect(market.collectOrder(created.id, buyerId)).rejects.toThrow('Cannot confirm');
    });

    it('lists the order for the vendor with what to collect and where to deliver', async () => {
      const created = await place('delivery');
      const rows = await market.listVendorOrders(providerId);
      expect(rows.find((r) => r.id === created.id)).toMatchObject({
        fulfilment: 'delivery',
        deliveryAddress: '12 Samora Machel Ave',
        amountDueUsdCents: 1300,
        buyerName: 'Buyer',
        canMarkReady: true,
        canComplete: true,
        canCancel: true,
      });
    });
  });

  describe('catalogue', () => {
    const list = async () =>
      (
        await market.listProducts({ lat: -17.8, lng: 31.03, radiusKm: 50, limit: 50, offset: 0 })
      ).items.map((p) => p.id);

    it('shows only approved vendors', async () => {
      const pending = await makeVendor('pending');
      const rejected = await makeVendor('rejected');
      const noApplication = await makeVendor(null);
      const approved = await makeVendor('approved');
      const ids = await list();
      expect(ids).toContain(approved.productId);
      expect(ids).not.toContain(pending.productId);
      expect(ids).not.toContain(rejected.productId);
      expect(ids).not.toContain(noApplication.productId);
      await expect(market.getProduct(pending.productId, -17.8, 31.03)).rejects.toThrow(
        'Product not found',
      );
    });

    it('hides the products of a restricted vendor', async () => {
      const shop = await makeVendor('approved');
      expect(await list()).toContain(shop.productId);
      vi.spyOn(standing, 'restrictedProviderIds').mockResolvedValue([shop.providerId]);
      expect(await list()).not.toContain(shop.productId);
      await expect(market.getProduct(shop.productId, -17.8, 31.03)).rejects.toThrow(
        'Product not found',
      );
    });

    it('describes how the vendor delivers and collects', async () => {
      const detail = await market.getProduct(productId, -17.8, 31.03);
      expect(detail).toMatchObject({
        delivers: true,
        deliveryChargeUsdCents: 300,
        deliveryAreas: ['Avondale'],
        pickupAddress: '1 Test Road, Avondale',
        pickupHours: 'Mon-Sat 9-5',
      });
    });

    it('measures distance to the shop pin when the vendor set one', async () => {
      const far = await makeVendor('approved', { lat: -17.8, lng: 31.03 });
      await prisma.vendorApplication.update({
        where: { providerId: far.providerId },
        // About 1.1 km north of the buyer; the profile itself sits at the buyer.
        data: { shopLat: -17.79, shopLng: 31.03 },
      });
      const detail = await market.getProduct(far.productId, -17.8, 31.03);
      expect(detail.distanceKm).toBeGreaterThan(1);
      expect(detail.distanceKm).toBeLessThan(1.3);
    });
  });
});
