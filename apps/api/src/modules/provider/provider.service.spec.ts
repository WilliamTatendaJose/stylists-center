import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import type { MatchingService } from '../matching/matching.service';
import { ProviderService } from './provider.service';

const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: 'postgresql://sc:sc@localhost:5433/sc_test',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  AUTH_DEV_OTP: '000000',
  TWILIO_VERIFY_CHANNEL: 'whatsapp',
  PAYMENT_PROVIDER: 'fake',
  PLATFORM_FEE_BPS: 500,
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
};

describe('ProviderService management', () => {
  let prisma: PrismaService;
  let provider: ProviderService;
  let cityId: string;
  let categoryId: string;
  let providerId: string;
  let providerUserId: string;
  let buyerId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();
    const suffix = `${String(Date.now())}-${String(Math.floor(Math.random() * 10000))}`;
    const city = await prisma.city.create({
      data: {
        name: `provider-test-${suffix}`,
        timezone: 'Africa/Harare',
        centroidLat: -17.8252,
        centroidLng: 31.0335,
        bboxWest: 30.9,
        bboxSouth: -18,
        bboxEast: 31.2,
        bboxNorth: -17.6,
      },
    });
    cityId = city.id;
    categoryId = (await prisma.category.create({ data: { name: `ProviderCat-${suffix}` } })).id;
    const providerUser = await prisma.user.create({
      data: {
        phone: `+263770${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Old Name',
        activeRole: 'provider',
        cityId,
      },
    });
    providerUserId = providerUser.id;
    buyerId = (
      await prisma.user.create({
        data: {
          phone: `+263779${String(Math.floor(Math.random() * 900000) + 100000)}`,
          displayName: 'Test Buyer',
          cityId,
        },
      })
    ).id;
    providerId = (
      await prisma.providerProfile.create({
        data: {
          userId: providerUserId,
          displayName: 'Old Name',
          tint: '#111111',
          initials: 'ON',
          categoryId,
          areaName: 'Old area',
          latitude: -17.8,
          longitude: 31.03,
          cityId,
          workingHoursLabel: 'Weekdays',
        },
      })
    ).id;
  });

  beforeEach(() => {
    provider = new ProviderService(
      prisma,
      new SocketEmitterService(),
      null as unknown as MatchingService,
    );
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { order: { providerId } } });
    await prisma.orderItem.deleteMany({ where: { order: { providerId } } });
    await prisma.order.deleteMany({ where: { providerId } });
    await prisma.product.deleteMany({ where: { providerId } });
    await prisma.service.deleteMany({ where: { providerId } });
    await prisma.providerProfile.delete({ where: { id: providerId } });
    await prisma.user.deleteMany({ where: { id: { in: [providerUserId, buyerId] } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('updates the public identity and location and adds services', async () => {
    const updated = await provider.updateProfile(providerId, {
      displayName: 'New Public Name',
      areaName: 'Avondale',
      workingHoursLabel: 'Mon-Sat, 8-6',
      lat: -17.79,
      lng: 31.04,
    });
    expect(updated).toMatchObject({
      displayName: 'New Public Name',
      areaName: 'Avondale',
      lat: -17.79,
      lng: 31.04,
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: providerUserId } })).displayName,
    ).toBe('New Public Name');

    const service = await provider.addService(providerId, {
      name: 'Knotless braids',
      durationMinutes: 120,
      priceUsdCents: 2500,
    });
    expect(service.name).toBe('Knotless braids');
    expect((await provider.getProfile(providerId)).services).toContainEqual(service);
  });

  it('creates inventory, exposes incoming orders, and records cash collection earnings', async () => {
    const product = await provider.createProduct(providerId, {
      name: 'Braiding hair',
      description: 'One packet',
      priceUsdCents: 500,
      stockQty: 8,
      imageUrls: [],
    });
    expect((await provider.getProducts(providerId)).some((row) => row.id === product.id)).toBe(
      true,
    );

    const order = await prisma.order.create({
      data: {
        reference: `PO-${String(Date.now())}`,
        buyerId,
        providerId,
        paymentMethod: 'cash',
        totalUsdCents: 1000,
        items: {
          create: {
            productId: product.id,
            nameSnapshot: product.name,
            priceUsdCents: 500,
            quantity: 2,
          },
        },
      },
    });
    expect((await provider.getOrders(providerId))[0]).toMatchObject({
      id: order.id,
      buyerName: 'Test Buyer',
      canMarkCollected: true,
    });

    await provider.collectOrder(order.id, providerId);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'collected',
    );
    expect(
      await prisma.payment.findFirst({ where: { orderId: order.id, status: 'released' } }),
    ).not.toBeNull();
    const earnings = await provider.getEarnings(providerId);
    expect(earnings.releasedUsdCents).toBe(950);
    expect(earnings.pendingUsdCents).toBe(0);
  });
});
