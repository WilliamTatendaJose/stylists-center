import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { MarketService } from './market.service';
import { FakeEcoCashAdapter } from '../payments/fake-ecocash.adapter';
import { PaymentStatusService } from '../payments/payment-status.service';
import type { PushService } from '../notifications/push.service';
import type { Env } from '../../config/env';

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

/**
 * Runs createOrder against a real Postgres. The unit spec mocks the
 * transaction client, which is how a query Prisma cannot execute (the
 * checkout lock, issued through $queryRaw) broke every marketplace checkout
 * in production without a single failing test.
 */
describe('MarketService.createOrder against the database', () => {
  let prisma: PrismaService;
  let market: MarketService;
  let buyerId: string;
  let providerId: string;
  let productId: string;

  beforeAll(async () => {
    const config = new ConfigService<Env, true>(BASE_ENV);
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const gateway = new FakeEcoCashAdapter();
    market = new MarketService(prisma, gateway, new PaymentStatusService(prisma, gateway), {
      sendToUser: () => Promise.resolve(),
    } as unknown as PushService);

    const stamp = String(Date.now());
    const city = await prisma.city.create({
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
    });
    const makeUser = async (displayName: string) =>
      (await prisma.user.create({ data: { phone: uniquePhone(), displayName, cityId: city.id } }))
        .id;
    buyerId = await makeUser('Buyer');
    const sellerUserId = await makeUser('Seller');
    const category = await prisma.category.create({ data: { name: `market-db-cat-${stamp}` } });
    providerId = (
      await prisma.providerProfile.create({
        data: {
          userId: sellerUserId,
          categoryId: category.id,
          displayName: 'Seller',
          initials: 'SE',
          tint: '#abc',
          areaName: 'Area',
          latitude: -17.8,
          longitude: 31.03,
          cityId: city.id,
          workingHoursLabel: 'Weekdays',
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          providerId,
          name: 'Wig',
          description: 'Test inventory',
          priceUsdCents: 1000,
          stockQty: 5,
          active: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('places a cash order and holds the stock', async () => {
    const created = await market.createOrder(buyerId, {
      providerId,
      checkoutKey: `db-cash-${String(Date.now())}`,
      paymentMethod: 'cash',
      items: [{ productId, quantity: 2 }],
    });

    expect(created.totalUsdCents).toBe(2000);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stockQty).toBe(3);
  });

  it('places an online order and records the payment with its channel', async () => {
    const created = await market.createOrder(buyerId, {
      providerId,
      checkoutKey: `db-online-${String(Date.now())}`,
      paymentMethod: 'ecocash',
      payChannel: 'onemoney',
      payerPhone: '0711234567',
      items: [{ productId, quantity: 1 }],
    });

    const payments = await prisma.payment.findMany({ where: { orderId: created.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountUsdCents: 1000, channel: 'onemoney' });
  });
});
