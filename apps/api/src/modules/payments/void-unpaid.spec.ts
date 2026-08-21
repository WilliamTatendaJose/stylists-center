import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { voidUnpaidSubject } from './void-unpaid';
import type { Env } from '../../config/env';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  UPLOAD_DIR: 'uploads',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-at-least-32-characters-long',
  ADMIN_JWT_REFRESH_PEPPER: 'test-admin-refresh-pepper-at-least-32-characters-long',
  ADMIN_WEB_ORIGIN: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'fake',
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
};

const uniquePhone = () => `+263779${String(Math.floor(Math.random() * 900000) + 100000)}`;

describe('voidUnpaidSubject', () => {
  let prisma: PrismaService;
  let cityId: string;
  let clientId: string;
  let providerProfileId: string;
  let serviceId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `void-test-${String(Date.now())}`,
        timezone: 'Africa/Harare',
        centroidLat: -17.8252,
        centroidLng: 31.0335,
        bboxWest: 30.9,
        bboxSouth: -18.0,
        bboxEast: 31.2,
        bboxNorth: -17.6,
      },
    });
    cityId = city.id;

    clientId = (
      await prisma.user.create({
        data: { phone: uniquePhone(), displayName: 'Buyer', cityId },
      })
    ).id;

    const providerUser = await prisma.user.create({
      data: { phone: uniquePhone(), displayName: 'Seller', cityId },
    });
    const category = await prisma.category.create({
      data: { name: `void-cat-${String(Date.now())}` },
    });
    const profile = await prisma.providerProfile.create({
      data: {
        userId: providerUser.id,
        categoryId: category.id,
        displayName: 'Seller',
        initials: 'SE',
        tint: '#abc',
        areaName: 'Area',
        latitude: -17.8,
        longitude: 31.03,
        cityId,
        workingHoursLabel: 'Weekdays',
      },
    });
    providerProfileId = profile.id;

    serviceId = (
      await prisma.service.create({
        data: {
          providerId: providerProfileId,
          name: 'Fade',
          durationMinutes: 30,
          priceUsdCents: 500,
        },
      })
    ).id;

    productId = (
      await prisma.product.create({
        data: {
          providerId: providerProfileId,
          name: 'Wig',
          description: 'Test inventory',
          priceUsdCents: 1000,
          stockQty: 10,
          active: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  async function makeBooking(status: 'awaiting_provider' | 'completed') {
    const startsAt = new Date(Date.now() + 48 * 60 * 60_000);
    return prisma.booking.create({
      data: {
        reference: `VOID-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        clientId,
        providerId: providerProfileId,
        serviceId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        paymentMethod: 'ecocash',
        priceUsdCents: 500,
        status,
      },
    });
  }

  it('cancels a booking whose payment was refused', async () => {
    const booking = await makeBooking('awaiting_provider');
    await voidUnpaidSubject(prisma, { bookingId: booking.id });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('cancelled');
  });

  it('leaves a completed booking alone — that one is not ours to rewrite', async () => {
    const booking = await makeBooking('completed');
    await voidUnpaidSubject(prisma, { bookingId: booking.id });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('completed');
  });

  it('cancels an order and puts its stock back', async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const order = await prisma.order.create({
      data: {
        reference: `VOID-O-${String(Date.now())}`,
        buyerId: clientId,
        providerId: providerProfileId,
        paymentMethod: 'ecocash',
        totalUsdCents: 2000,
        items: {
          create: [{ productId, nameSnapshot: 'Wig', priceUsdCents: 1000, quantity: 2 }],
        },
      },
    });
    // Checkout decrements stock, so mirror that before voiding.
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: { decrement: 2 } },
    });

    await voidUnpaidSubject(prisma, { orderId: order.id });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('cancelled');
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stockQty).toBe(before.stockQty);
  });

  /** Callbacks retry and the poll can see the same verdict twice. */
  it('is idempotent — a second void does not restock again', async () => {
    const order = await prisma.order.create({
      data: {
        reference: `VOID-O2-${String(Date.now())}`,
        buyerId: clientId,
        providerId: providerProfileId,
        paymentMethod: 'ecocash',
        totalUsdCents: 1000,
        items: {
          create: [{ productId, nameSnapshot: 'Wig', priceUsdCents: 1000, quantity: 1 }],
        },
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: { decrement: 1 } },
    });

    await voidUnpaidSubject(prisma, { orderId: order.id });
    const once = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    await voidUnpaidSubject(prisma, { orderId: order.id });
    const twice = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    expect(twice.stockQty).toBe(once.stockQty);
  });

  it('does nothing for a subscription — a refused one never bought anything', async () => {
    const before = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
    });
    await voidUnpaidSubject(prisma, { subscriptionProviderId: providerProfileId });

    const after = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
    });
    expect(after.subscriptionPaidUntil).toEqual(before.subscriptionPaidUntil);
  });
});
