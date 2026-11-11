import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { TrustService } from '../trust/trust.service';
import { MatchingService } from '../matching/matching.service';
import { GeoRepository } from '../geo/geo.repository';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { FakeEcoCashAdapter } from '../payments/fake-ecocash.adapter';
import { PaymentStatusService } from '../payments/payment-status.service';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { SettingsService } from '../settings/settings.service';
import { BookingLifecycleService } from './booking-lifecycle.service';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import type { Env } from '../../config/env';

/**
 * Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox.
 * Covers slot-conflict rejection, the cash double-confirmation rule (plan §8
 * calls this out as a must-have integration test), the EcoCash escrow
 * held->released ledger, reviews, and the matchId->confirmForBooking wiring
 * that supersedes sibling accepted offers.
 */
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

const CLIENT_LOCATION = { lat: -17.7955, lng: 31.033 };

interface FakeJob {
  id: string;
  remove: () => Promise<void>;
}

class FakeQueue {
  private readonly jobs = new Map<string, FakeJob>();

  add(_name: string, _data: unknown, opts?: { jobId?: string }): Promise<FakeJob> {
    const id = opts?.jobId ?? `auto-${String(this.jobs.size)}`;
    const job: FakeJob = {
      id,
      remove: async () => this.jobs.delete(id) as unknown as Promise<void>,
    };
    this.jobs.set(id, job);
    return Promise.resolve(job);
  }

  getJob(jobId: string): Promise<FakeJob | null> {
    return Promise.resolve(this.jobs.get(jobId) ?? null);
  }
}

/**
 * Stands in for the rewards programme (built separately): the real hook
 * refuses until it exists, and these tests are about what bookings do around
 * it. Records every call so tests can see which ones happened and in what
 * transaction.
 */
class FakeRewards extends RewardsHooksService {
  completed: { bookingId: string; clientId: string; amountPaidUsdCents: number }[] = [];
  redeemed: { bookingId: string; providerUserId: string; coins: number }[] = [];
  refunded: string[] = [];
  /** Coins are worth 10 cents each (the `coinUsdCents` default). */
  failRedeem = false;

  override onBookingCompleted(
    _tx: Prisma.TransactionClient,
    input: { bookingId: string; clientId: string; amountPaidUsdCents: number },
  ): Promise<void> {
    this.completed.push(input);
    return Promise.resolve();
  }

  override redeemForBooking(
    _tx: Prisma.TransactionClient,
    input: { bookingId: string; clientId: string; providerUserId: string; coins: number },
  ): Promise<{ usdCents: number }> {
    if (this.failRedeem) return Promise.reject(new Error('Not enough coins'));
    this.redeemed.push(input);
    return Promise.resolve({ usdCents: input.coins * 10 });
  }

  override refundRedemption(
    _tx: Prisma.TransactionClient,
    ref: { bookingId: string } | { orderId: string },
  ): Promise<void> {
    if ('bookingId' in ref) this.refunded.push(ref.bookingId);
    return Promise.resolve();
  }
}

class FakeStanding extends FeeStandingService {
  restricted = new Set<string>();
  override assertCanTrade(providerId: string): Promise<void> {
    if (this.restricted.has(providerId)) {
      return Promise.reject(new ForbiddenException('Pay your balance to take new bookings'));
    }
    return Promise.resolve();
  }
}

describe('BookingsService', () => {
  let prisma: PrismaService;
  let bookings: BookingsService;
  let rewards: FakeRewards;
  let standing: FakeStanding;
  let lifecycle: BookingLifecycleService;
  let fees: FeeLedgerService;
  let matching: MatchingService;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  let providerAId: string;
  let providerAUserId: string;
  let serviceAId: string;
  let providerBId: string;
  let providerBUserId: string;
  let providerCId: string;
  let providerCUserId: string;
  let serviceCId: string;
  const createdBookingIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `bookings-test-${String(Date.now())}`,
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

    const category = await prisma.category.create({
      data: { name: `BookingCat-${String(Date.now())}` },
    });
    categoryId = category.id;

    const client = await prisma.user.create({
      data: {
        phone: `+263773${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Booking Client',
        cityId,
      },
    });
    clientId = client.id;

    const providerAUser = await prisma.user.create({
      data: {
        phone: `+263774${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Provider A',
        cityId,
      },
    });
    providerAUserId = providerAUser.id;
    const providerA = await prisma.providerProfile.create({
      data: {
        userId: providerAUser.id,
        displayName: 'Provider A',
        tint: '#000000',
        initials: 'PA',
        categoryId,
        areaName: 'Test area',
        latitude: -17.793,
        longitude: 31.0345,
        cityId,
        workingHoursLabel: 'Always',
        // bookings.create() rejects a direct booking against a provider
        // whose subscription has lapsed — without this every booking test
        // below would fail that check before reaching what it's testing.
        subscriptionPaidUntil: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        services: { create: [{ name: 'Test service', durationMinutes: 30, priceUsdCents: 2000 }] },
      },
      include: { services: true },
    });
    providerAId = providerA.id;
    const [firstService] = providerA.services;
    if (!firstService) throw new Error('expected the seeded service to exist');
    serviceAId = firstService.id;

    const providerBUser = await prisma.user.create({
      data: {
        phone: `+263775${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Provider B',
        cityId,
      },
    });
    const providerB = await prisma.providerProfile.create({
      data: {
        userId: providerBUser.id,
        displayName: 'Provider B',
        tint: '#111111',
        initials: 'PB',
        categoryId,
        areaName: 'Test area',
        latitude: -17.795,
        longitude: 31.034,
        cityId,
        workingHoursLabel: 'Always',
        subscriptionPaidUntil: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      },
    });
    providerBId = providerB.id;
    providerBUserId = providerBUser.id;

    const providerCUser = await prisma.user.create({
      data: {
        phone: `+263776${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Provider C (lapsed)',
        cityId,
      },
    });
    providerCUserId = providerCUser.id;
    const providerC = await prisma.providerProfile.create({
      data: {
        userId: providerCUser.id,
        displayName: 'Provider C',
        tint: '#222222',
        initials: 'PC',
        categoryId,
        areaName: 'Test area',
        latitude: -17.796,
        longitude: 31.036,
        cityId,
        workingHoursLabel: 'Always',
        // Deliberately no subscriptionPaidUntil — a lapsed/never-paid provider.
        services: { create: [{ name: 'Test service', durationMinutes: 30, priceUsdCents: 1500 }] },
      },
      include: { services: true },
    });
    providerCId = providerC.id;
    const [serviceC] = providerC.services;
    if (!serviceC) throw new Error('expected the seeded service to exist');
    serviceCId = serviceC.id;
  });

  afterAll(async () => {
    await prisma.feeLedgerEntry.deleteMany({
      where: { providerId: { in: [providerAId, providerBId, providerCId] } },
    });
    await prisma.review.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await prisma.payment.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    await prisma.matchOffer.deleteMany({
      where: { providerId: { in: [providerAId, providerBId, providerCId] } },
    });
    await prisma.matchRequest.deleteMany({ where: { clientId } });
    await prisma.service.deleteMany({
      where: { providerId: { in: [providerAId, providerBId, providerCId] } },
    });
    await prisma.providerProfile.deleteMany({
      where: { id: { in: [providerAId, providerBId, providerCId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [clientId, providerAUserId, providerBUserId, providerCUserId] } },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    const geo = new GeoRepository(prisma);
    const socketEmitter = new SocketEmitterService();
    // Real PushService, no stub: the test users have no DevicePushToken rows,
    // so every send short-circuits before it would reach the network.
    const push = new PushService(prisma, new ConfigService<Env, true>(BASE_ENV));
    matching = new MatchingService(
      prisma,
      geo,
      socketEmitter,
      push,
      new FakeQueue() as unknown as Queue,
    );
    const gateway = new FakeEcoCashAdapter();
    // 3% fee, 10c coins: the defaults, pinned so the sums below are stable.
    const settings = new SettingsService(undefined, {});
    rewards = new FakeRewards(prisma);
    standing = new FakeStanding();
    fees = new FeeLedgerService(prisma, settings);
    lifecycle = new BookingLifecycleService(
      prisma,
      fees,
      rewards,
      standing,
      socketEmitter,
      push,
      settings,
    );
    bookings = new BookingsService(
      prisma,
      socketEmitter,
      matching,
      new TrustService(prisma),
      push,
      new PaymentStatusService(prisma, gateway),
      standing,
      rewards,
      lifecycle,
      settings,
    );
  });

  /**
   * A distinct, always-bookable slot: tomorrow at 08:00 Harare (06:00 UTC)
   * plus `offsetHours`. Slots relative to *now* drifted outside the default
   * 07:00-20:00 Harare working hours (LEGACY_WEEKLY_HOURS) whenever the suite
   * ran later in the day, so which tests failed depended on the clock.
   * Offsets up to 11 keep a 30-minute service inside the same working day.
   */
  function futureSlot(offsetHours: number, daysAhead = 1): string {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + daysAhead);
    tomorrow.setUTCHours(6, 0, 0, 0);
    return new Date(tomorrow.getTime() + offsetHours * 60 * 60_000).toISOString();
  }

  /** A booking paid in the app, as made before clients paid stylists directly. */
  async function seedLegacyOnlineBooking(slot: string, status: 'awaiting_provider' | 'confirmed') {
    const startsAt = new Date(slot);
    const booking = await prisma.booking.create({
      data: {
        reference: `SC-L${String(Math.floor(Math.random() * 90000) + 10000)}`,
        clientId,
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        paymentMethod: 'ecocash',
        priceUsdCents: 2000,
        status,
      },
    });
    createdBookingIds.push(booking.id);
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: 'fake-ecocash',
        status: 'held',
        amountUsdCents: 2000,
        externalRef: `legacy-${booking.id}`,
      },
    });
    return booking;
  }

  it('creates a cash booking with a reference and no payment row', async () => {
    const startsAt = futureSlot(1);
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt,
    });
    createdBookingIds.push(created.id);

    expect(created.reference).toMatch(/^SC-\d{4,}$/);
    expect(created.status).toBe('awaiting_provider');

    const payments = await prisma.payment.findMany({ where: { bookingId: created.id } });
    expect(payments).toHaveLength(0);
  });

  it('is paid to the stylist directly: the price plus the 3% fee is frozen, with no payment row', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(2, 3),
    });
    createdBookingIds.push(created.id);

    expect(await prisma.payment.count({ where: { bookingId: created.id } })).toBe(0);
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      paymentMethod: 'cash',
      priceUsdCents: 2000,
      serviceFeeUsdCents: 60,
      serviceFeeBps: 300,
      coinsUsed: 0,
      coinsUsdCents: 0,
    });
    const row = (await bookings.listForClient(clientId)).find((r) => r.id === created.id);
    expect(row).toMatchObject({
      priceUsdCents: 2000,
      serviceFeeUsdCents: 60,
      clientTotalUsdCents: 2060,
      amountDueUsdCents: 2060,
      providerPaymentPhone: null,
    });
  });

  it('shows the stylist payment number to the client once the booking is confirmed', async () => {
    await prisma.providerProfile.update({
      where: { id: providerAId },
      data: { paymentPhone: '+263771234567' },
    });
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(10, 3),
    });
    createdBookingIds.push(created.id);
    const phoneOf = async () =>
      (await bookings.listForClient(clientId)).find((r) => r.id === created.id)
        ?.providerPaymentPhone;
    expect(await phoneOf()).toBeNull();
    await lifecycle.accept(created.id, providerAId);
    expect(await phoneOf()).toBe('+263771234567');
  });

  it('refuses a booking with a restricted stylist, and a stylist accepting once restricted', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(9, 3),
    });
    createdBookingIds.push(created.id);

    standing.restricted.add(providerAId);
    try {
      await expect(
        bookings.create(clientId, {
          providerId: providerAId,
          serviceId: serviceAId,
          startsAt: futureSlot(8, 3),
        }),
      ).rejects.toThrow('Pay your balance');
      await expect(lifecycle.accept(created.id, providerAId)).rejects.toThrow('Pay your balance');
    } finally {
      standing.restricted.delete(providerAId);
    }
    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(unchanged.status).toBe('awaiting_provider');
  });

  describe('paying with coins', () => {
    it('redeems inside the booking, stores coins and their value, and lowers what is due', async () => {
      const created = await bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt: futureSlot(2, 4),
        coins: 5,
      });
      createdBookingIds.push(created.id);

      expect(rewards.redeemed).toEqual([
        { bookingId: created.id, clientId, providerUserId: providerAUserId, coins: 5 },
      ]);
      const row = (await bookings.listForClient(clientId)).find((r) => r.id === created.id);
      expect(row).toMatchObject({
        coinsUsed: 5,
        coinsUsdCents: 50,
        clientTotalUsdCents: 2060,
        amountDueUsdCents: 2010,
      });
    });

    it('refuses more coins than the booking is worth, before touching the wallet', async () => {
      // $20.60 at 10c a coin is 206 coins at most.
      await expect(
        bookings.create(clientId, {
          providerId: providerAId,
          serviceId: serviceAId,
          startsAt: futureSlot(3, 4),
          coins: 207,
        }),
      ).rejects.toThrow('at most 206 coins');
      expect(rewards.redeemed).toHaveLength(0);
    });

    it('can cover the whole amount', async () => {
      const created = await bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt: futureSlot(4, 4),
        coins: 206,
      });
      createdBookingIds.push(created.id);
      const row = (await bookings.listForClient(clientId)).find((r) => r.id === created.id);
      expect(row?.amountDueUsdCents).toBe(0);
    });

    it('gives the coins back when the client cancels', async () => {
      const created = await bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt: futureSlot(5, 4),
        coins: 3,
      });
      createdBookingIds.push(created.id);
      await bookings.cancel(created.id, clientId);
      await bookings.cancel(created.id, clientId); // a retry must not refund twice
      expect(rewards.refunded).toEqual([created.id]);
    });

    it('gives the coins back when the stylist declines or the request expires', async () => {
      const declined = await bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt: futureSlot(6, 4),
        coins: 2,
      });
      const expired = await bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt: futureSlot(7, 4),
        coins: 4,
      });
      createdBookingIds.push(declined.id, expired.id);

      await lifecycle.decline(declined.id, providerAId);
      await prisma.booking.update({
        where: { id: expired.id },
        data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });
      await bookings.listForClient(clientId);
      expect(rewards.refunded.sort()).toEqual([declined.id, expired.id].sort());
    });

    it('creates no booking and takes nothing when the wallet refuses', async () => {
      rewards.failRedeem = true;
      await expect(
        bookings.create(clientId, {
          providerId: providerAId,
          serviceId: serviceAId,
          startsAt: futureSlot(8, 4),
          coins: 5,
        }),
      ).rejects.toThrow('Not enough coins');
      expect(
        await prisma.booking.findFirst({
          where: { providerId: providerAId, startsAt: new Date(futureSlot(8, 4)) },
        }),
      ).toBeNull();
    });
  });

  it('rejects a booking when the slot is already taken', async () => {
    const startsAt = futureSlot(3);
    const first = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt,
    });
    createdBookingIds.push(first.id);

    await expect(
      bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt,
      }),
    ).rejects.toThrow('no longer available');
  });

  it('refuses a stylist booking their own service', async () => {
    await expect(
      bookings.create(providerAUserId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt: futureSlot(5),
      }),
    ).rejects.toThrow("You can't book your own services");
  });

  it('does not need the stylist to hold a subscription: stylists no longer pay one', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerCId,
      serviceId: serviceCId,
      startsAt: futureSlot(4),
    });
    createdBookingIds.push(created.id);
    expect(created.status).toBe('awaiting_provider');
  });

  it('confirmCompletion refuses a booking that is not yet confirmed by the provider', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(4),
    });
    createdBookingIds.push(created.id);

    await expect(bookings.confirmCompletion(created.id, clientId)).rejects.toThrow(
      'Cannot confirm completion',
    );
  });

  it('expires an unanswered booking after one hour and refunds an older online payment', async () => {
    const legacy = await seedLegacyOnlineBooking(futureSlot(10), 'awaiting_provider');
    await prisma.booking.update({
      where: { id: legacy.id },
      data: { createdAt: new Date(Date.now() - 61 * 60_000) },
    });

    const listed = await bookings.listForClient(clientId);
    expect(listed.find((booking) => booking.id === legacy.id)?.status).toBe('declined');
    expect(
      await prisma.payment.findFirst({
        where: { bookingId: legacy.id },
        orderBy: { createdAt: 'desc' },
      }),
    ).toMatchObject({ status: 'refunded', feeUsdCents: 0 });
  });

  it('a booking needs both sides confirmed before it completes', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(5),
    });
    createdBookingIds.push(created.id);
    await lifecycle.accept(created.id, providerAId);
    const result = await bookings.confirmCompletion(created.id, clientId);
    expect(result.confirmedByClient).toBe(true);
    expect(result.status).toBe('confirmed'); // still waiting on the stylist's side
    expect(rewards.completed).toHaveLength(0);
    expect(await prisma.feeLedgerEntry.count({ where: { bookingId: created.id } })).toBe(0);

    const again = await bookings.confirmCompletion(created.id, clientId);
    expect(again.status).toBe('confirmed'); // a retry is not a second confirmation

    await lifecycle.confirm(created.id, 'provider');
    const done = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(done.status).toBe('completed');
    expect(done.autoCompleted).toBe(false);
  });

  it('an older online booking completes and releases escrow on the client confirmation alone, with no fee', async () => {
    const completedBefore = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerAId },
      select: { completedCount: true },
    });
    const created = await seedLegacyOnlineBooking(futureSlot(6), 'confirmed');
    const held = await prisma.payment.findFirstOrThrow({
      where: { bookingId: created.id, status: 'held' },
    });
    // Production Paynow callbacks append `paid`; completion must release
    // that state as well as the fake gateway's direct `held` state.
    await prisma.payment.create({
      data: {
        bookingId: created.id,
        provider: 'paynow',
        status: 'paid',
        amountUsdCents: held.amountUsdCents,
        feeUsdCents: held.feeUsdCents,
        externalRef: 'paynow-test-reference',
      },
    });

    const result = await bookings.confirmCompletion(created.id, clientId);
    expect(result.status).toBe('completed');

    const payments = await prisma.payment.findMany({
      where: { bookingId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments.map((p) => p.status)).toEqual(['held', 'paid', 'released']);

    const completedAfter = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerAId },
      select: { completedCount: true },
    });
    expect(completedAfter.completedCount).toBe(completedBefore.completedCount + 1);

    await bookings.confirmCompletion(created.id, clientId);
    const afterRetry = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerAId },
      select: { completedCount: true },
    });
    expect(afterRetry.completedCount).toBe(completedAfter.completedCount);
    expect(await prisma.feeLedgerEntry.count({ where: { bookingId: created.id } })).toBe(0);
    expect(rewards.completed).toHaveLength(0);
  });

  it('lets the client review a completed booking exactly once, and updates the provider rating', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(7),
    });
    createdBookingIds.push(created.id);
    await prisma.booking.update({ where: { id: created.id }, data: { status: 'completed' } });

    await bookings.createReview(created.id, clientId, {
      rating: 5,
      text: 'Friendly, careful, and right on time.',
    });
    expect(await prisma.review.findFirst({ where: { bookingId: created.id } })).toMatchObject({
      rating: 5,
      text: 'Friendly, careful, and right on time.',
    });
    const provider = await prisma.providerProfile.findUniqueOrThrow({ where: { id: providerAId } });
    expect(provider.ratingAvg).toBe(5);

    await expect(bookings.createReview(created.id, clientId, { rating: 4 })).rejects.toThrow(
      'Already reviewed',
    );

    const rows = await bookings.listForClient(clientId);
    const row = rows.find((r) => r.id === created.id);
    expect(row?.canRate).toBe(false);
  });

  it('supersedes sibling accepted offers when a booking confirms one via matchId', async () => {
    const match = await prisma.matchRequest.create({
      data: {
        clientId,
        categoryId,
        budgetMode: 'flex',
        radiusKm: 3,
        latitude: CLIENT_LOCATION.lat,
        longitude: CLIENT_LOCATION.lng,
        state: 'accepted',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    const winningOffer = await prisma.matchOffer.create({
      data: {
        matchRequestId: match.id,
        providerId: providerAId,
        state: 'accepted',
        quoteUsdCents: 2000,
        respondBy: new Date(Date.now() + 30_000),
      },
    });
    const siblingOffer = await prisma.matchOffer.create({
      data: {
        matchRequestId: match.id,
        providerId: providerBId,
        state: 'accepted',
        quoteUsdCents: 1500,
        respondBy: new Date(Date.now() + 30_000),
      },
    });

    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(8),
      matchId: match.id,
    });
    createdBookingIds.push(created.id);

    const updatedMatch = await prisma.matchRequest.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.state).toBe('confirmed');

    const winning = await prisma.matchOffer.findUniqueOrThrow({ where: { id: winningOffer.id } });
    expect(winning.state).toBe('accepted');
    const sibling = await prisma.matchOffer.findUniqueOrThrow({ where: { id: siblingOffer.id } });
    expect(sibling.state).toBe('declined');
  });
});
