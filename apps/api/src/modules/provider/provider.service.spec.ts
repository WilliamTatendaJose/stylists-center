import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import type { MatchingService } from '../matching/matching.service';
import { FakeEcoCashAdapter } from '../payments/fake-ecocash.adapter';
import { PaymentStatusService } from '../payments/payment-status.service';
import type { PaymentGatewayPort } from '../payments/payment-gateway.port';
import { ProviderService } from './provider.service';

const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  TRUST_PROXY_HOPS: 1,
  ADMIN_MFA_REQUIRED: false,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test',
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

const vendorApplication = (status: 'pending' | 'approved' | 'rejected') => ({
  providerId: '',
  businessName: 'Test shop',
  shopAddress: '1 Test Road',
  contactName: 'Owner',
  contactPhone: '+263771234567',
  status,
});

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
    const gateway = new FakeEcoCashAdapter();
    provider = new ProviderService(
      prisma,
      new SocketEmitterService(),
      null as unknown as MatchingService,
      new PushService(prisma, new ConfigService<Env, true>(BASE_ENV)),
      gateway,
      new PaymentStatusService(prisma, gateway),
    );
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { subscriptionProviderId: providerId } });
    await prisma.payment.deleteMany({ where: { order: { providerId } } });
    await prisma.orderItem.deleteMany({ where: { order: { providerId } } });
    await prisma.order.deleteMany({ where: { providerId } });
    await prisma.product.deleteMany({ where: { providerId } });
    await prisma.service.deleteMany({ where: { providerId } });
    await prisma.vendorApplication.deleteMany({ where: { providerId } });
    await prisma.payout.deleteMany({ where: { providerId } });
    await prisma.providerProfile.delete({ where: { id: providerId } });
    await prisma.user.deleteMany({ where: { id: { in: [providerUserId, buyerId] } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('saves the payment number in E.164, keeps it when omitted and clears it on null', async () => {
    const base = {
      displayName: 'New Public Name',
      areaName: 'Avondale',
      workingHoursLabel: 'Mon-Sat, 8-6',
      lat: -17.79,
      lng: 31.04,
    };
    const saved = await provider.updateProfile(providerId, { ...base, paymentPhone: '0771234567' });
    expect(saved.paymentPhone).toBe('+263771234567');

    const kept = await provider.updateProfile(providerId, base);
    expect(kept.paymentPhone).toBe('+263771234567');

    const cleared = await provider.updateProfile(providerId, { ...base, paymentPhone: null });
    expect(cleared.paymentPhone).toBeNull();
  });

  it('updates the public identity and location and adds services', async () => {
    const updated = await provider.updateProfile(providerId, {
      displayName: 'New Public Name',
      areaName: 'Avondale',
      workingHoursLabel: 'Mon-Sat, 8-6',
      lat: -17.79,
      lng: 31.04,
      profileImageUrl: '/uploads/public-page.jpg',
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
      imageUrls: ['/uploads/braids.jpg'],
    });
    expect(service.name).toBe('Knotless braids');
    expect(service.imageUrls).toEqual(['/uploads/braids.jpg']);
    expect((await provider.getProfile(providerId)).services).toContainEqual(service);

    const edited = await provider.updateService(service.id, providerId, {
      name: 'Small knotless braids',
      durationMinutes: 150,
      priceUsdCents: 3000,
      imageUrls: ['/uploads/braids-2.jpg'],
    });
    expect(edited).toMatchObject({
      name: 'Small knotless braids',
      imageUrls: ['/uploads/braids-2.jpg'],
    });
  });

  it('lists products only for an approved vendor', async () => {
    const input = {
      name: 'Braiding hair',
      description: 'One packet',
      priceUsdCents: 500,
      stockQty: 8,
      imageUrls: [],
    };
    // No application, then a pending one, then a rejected one: none may list.
    await expect(provider.createProduct(providerId, input)).rejects.toThrow('must be approved');
    for (const status of ['pending', 'rejected'] as const) {
      await prisma.vendorApplication.upsert({
        where: { providerId },
        create: { ...vendorApplication(status), providerId },
        update: { status },
      });
      await expect(provider.createProduct(providerId, input)).rejects.toThrow('must be approved');
    }
    expect(await prisma.product.count({ where: { providerId } })).toBe(0);

    await prisma.vendorApplication.update({ where: { providerId }, data: { status: 'approved' } });
    const product = await provider.createProduct(providerId, input);
    expect((await provider.getProducts(providerId)).some((row) => row.id === product.id)).toBe(
      true,
    );
  });

  it('totals earnings from the newest ledger row per order and lists one entry each', async () => {
    const before = await provider.getEarnings(providerId);
    const stamp = String(Date.now());
    const makeOrder = async (suffix: string) =>
      prisma.order.create({
        data: {
          reference: `PE-${stamp}-${suffix}`,
          buyerId,
          providerId,
          paymentMethod: 'ecocash',
          totalUsdCents: 1000,
        },
      });
    const [released, held, refunded] = await Promise.all([
      makeOrder('A'),
      makeOrder('B'),
      makeOrder('C'),
    ]);
    const at = (msAgo: number) => new Date(Date.now() - msAgo);
    await prisma.payment.createMany({
      data: [
        // A: held, then released net of a 100c fee -> counts 900 as released only.
        {
          orderId: released.id,
          provider: 'fake-ecocash',
          status: 'held',
          amountUsdCents: 1000,
          createdAt: at(5000),
        },
        {
          orderId: released.id,
          provider: 'fake-ecocash',
          status: 'released',
          amountUsdCents: 1000,
          feeUsdCents: 100,
          createdAt: at(4000),
        },
        // B: still held -> 500 pending.
        {
          orderId: held.id,
          provider: 'fake-ecocash',
          status: 'held',
          amountUsdCents: 500,
          createdAt: at(3000),
        },
        // C: held then refunded -> counts toward neither total.
        {
          orderId: refunded.id,
          provider: 'fake-ecocash',
          status: 'held',
          amountUsdCents: 300,
          createdAt: at(2000),
        },
        {
          orderId: refunded.id,
          provider: 'fake-ecocash',
          status: 'refunded',
          amountUsdCents: 300,
          createdAt: at(1000),
        },
      ],
    });

    const after = await provider.getEarnings(providerId);
    expect(after.releasedUsdCents - before.releasedUsdCents).toBe(900);
    expect(after.pendingUsdCents - before.pendingUsdCents).toBe(500);

    const mine = after.entries.filter((entry) => entry.reference.startsWith(`PE-${stamp}-`));
    expect(mine.map((entry) => [entry.reference, entry.status, entry.kind])).toEqual([
      [`PE-${stamp}-C`, 'refunded', 'order'],
      [`PE-${stamp}-B`, 'held', 'order'],
      [`PE-${stamp}-A`, 'released', 'order'],
    ]);
    expect(mine[0]).toMatchObject({ counterpartyName: 'Test Buyer', feeUsdCents: 0 });

    // Released is not paid out: only an admin-recorded payout makes it so.
    expect(mine[2]).toMatchObject({ status: 'released', paidOut: false });
    expect(after.awaitingPayoutUsdCents).toBe(after.releasedUsdCents - after.paidOutUsdCents);

    await prisma.payout.create({
      data: {
        providerId,
        amountUsdCents: after.releasedUsdCents - after.paidOutUsdCents,
        note: 'test',
      },
    });
    const paid = await provider.getEarnings(providerId);
    const paidEntry = paid.entries.find((entry) => entry.reference === `PE-${stamp}-A`);
    expect(paidEntry).toMatchObject({ status: 'released', paidOut: true });
    expect(paid.awaitingPayoutUsdCents).toBe(0);
    expect(paid.paidOutUsdCents).toBe(paid.releasedUsdCents);
  });

  describe('subscription', () => {
    it('is inactive with no paidUntil for a provider who has never paid', async () => {
      const subscription = await provider.getSubscription(providerId);
      expect(subscription).toMatchObject({ priceUsdCents: 500, paidUntil: null, active: false });
    });

    it('creates a checkout intent for EcoCash and applies it on success, same as a fresh booking', async () => {
      const before = await provider.getSubscription(providerId);
      const result = await provider.paySubscription(providerId, { paymentMethod: 'ecocash' });
      expect(new Date(result.paidUntil ?? '').getTime()).toBeGreaterThan(
        before.paidUntil ? new Date(before.paidUntil).getTime() : Date.now(),
      );

      const payment = await prisma.payment.findFirst({
        where: { subscriptionProviderId: providerId, provider: 'fake-ecocash' },
      });
      expect(payment).toMatchObject({ status: 'held', amountUsdCents: 500 });
    });

    /**
     * The gateway call only proves a prompt was sent. Crediting the month at
     * that point handed a free month to anyone who opened a Paynow checkout
     * and walked away — the whole reason the paid/pending split exists.
     */
    it('does not extend the subscription while a real gateway payment is still pending', async () => {
      const pendingGateway: PaymentGatewayPort = {
        createCheckout: () =>
          Promise.resolve({
            externalRef: 'https://paynow.example/poll/1',
            status: 'pending',
            instructions: 'Approve the prompt on your phone',
            provider: 'paynow',
          }),
        verifyCallback: () => false,
        pollStatus: () => Promise.resolve('pending'),
      };
      const pendingProvider = new ProviderService(
        prisma,
        new SocketEmitterService(),
        null as unknown as MatchingService,
        new PushService(prisma, new ConfigService<Env, true>(BASE_ENV)),
        pendingGateway,
        new PaymentStatusService(prisma, pendingGateway),
      );

      const before = await pendingProvider.getSubscription(providerId);
      const result = await pendingProvider.paySubscription(providerId, {
        paymentMethod: 'ecocash',
      });

      expect(result.pending).toBe(true);
      expect(result.paidUntil).toBe(before.paidUntil);
      expect(result.instructions).toBe('Approve the prompt on your phone');

      const after = await pendingProvider.getSubscription(providerId);
      expect(after.paidUntil).toBe(before.paidUntil);
      expect(after.active).toBe(before.active);
    });

    it('credits the month once a poll reports the payment paid', async () => {
      let reported: 'pending' | 'paid' = 'pending';
      const settlingGateway: PaymentGatewayPort = {
        createCheckout: () =>
          Promise.resolve({
            externalRef: 'https://paynow.example/poll/2',
            status: 'pending',
            provider: 'paynow',
          }),
        verifyCallback: () => false,
        pollStatus: () => Promise.resolve(reported),
      };
      const settlingProvider = new ProviderService(
        prisma,
        new SocketEmitterService(),
        null as unknown as MatchingService,
        new PushService(prisma, new ConfigService<Env, true>(BASE_ENV)),
        settlingGateway,
        new PaymentStatusService(prisma, settlingGateway),
      );

      const before = await settlingProvider.getSubscription(providerId);
      await settlingProvider.paySubscription(providerId, { paymentMethod: 'ecocash' });

      // Still unpaid: whatever the provider had before is exactly what they
      // still have — this call must not have bought them anything.
      const stillPending = await settlingProvider.subscriptionPaymentStatus(providerId);
      expect(stillPending.status).toBe('pending');
      expect(stillPending.paidUntil).toBe(before.paidUntil);

      reported = 'paid';
      const settled = await settlingProvider.subscriptionPaymentStatus(providerId);
      expect(settled.status).toBe('paid');
      expect(settled.active).toBe(true);
      expect(new Date(settled.paidUntil ?? '').getTime()).toBeGreaterThan(
        new Date(before.paidUntil ?? 0).getTime(),
      );

      // Polling again after settlement must not stack a second month on.
      const repeat = await settlingProvider.subscriptionPaymentStatus(providerId);
      expect(repeat.paidUntil).toBe(settled.paidUntil);
    });
  });
});
