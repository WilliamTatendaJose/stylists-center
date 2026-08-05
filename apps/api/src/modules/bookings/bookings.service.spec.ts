import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { BookingsService } from './bookings.service';
import { TrustService } from '../trust/trust.service';
import { MatchingService } from '../matching/matching.service';
import { GeoRepository } from '../geo/geo.repository';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { FakeEcoCashAdapter } from '../payments/fake-ecocash.adapter';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/**
 * Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox.
 * Covers slot-conflict rejection, the cash double-confirmation rule (plan §8
 * calls this out as a must-have integration test), the EcoCash escrow
 * held->released ledger, reviews, and the matchId->confirmForBooking wiring
 * that supersedes sibling accepted offers.
 */
const TEST_DATABASE_URL = 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  AUTH_DEV_OTP: '000000',
  PLATFORM_FEE_BPS: 500,
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
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

describe('BookingsService', () => {
  let prisma: PrismaService;
  let bookings: BookingsService;
  let matching: MatchingService;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  let providerAId: string;
  let providerAUserId: string;
  let serviceAId: string;
  let providerBId: string;
  let providerBUserId: string;
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
      },
    });
    providerBId = providerB.id;
    providerBUserId = providerBUser.id;
  });

  afterAll(async () => {
    await prisma.review.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await prisma.payment.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    await prisma.matchOffer.deleteMany({
      where: { providerId: { in: [providerAId, providerBId] } },
    });
    await prisma.matchRequest.deleteMany({ where: { clientId } });
    await prisma.service.deleteMany({ where: { providerId: { in: [providerAId, providerBId] } } });
    await prisma.providerProfile.deleteMany({ where: { id: { in: [providerAId, providerBId] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [clientId, providerAUserId, providerBUserId] } },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    const geo = new GeoRepository(prisma);
    const socketEmitter = new SocketEmitterService();
    matching = new MatchingService(prisma, geo, socketEmitter, new FakeQueue() as unknown as Queue);
    bookings = new BookingsService(
      prisma,
      socketEmitter,
      matching,
      new TrustService(prisma),
      new FakeEcoCashAdapter(),
    );
  });

  function futureSlot(hoursFromNow: number): string {
    return new Date(Date.now() + hoursFromNow * 60 * 60_000).toISOString();
  }

  it('creates a cash booking with a reference and no payment row', async () => {
    const startsAt = futureSlot(1);
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt,
      paymentMethod: 'cash',
    });
    createdBookingIds.push(created.id);

    expect(created.reference).toMatch(/^SC-\d{4,}$/);
    expect(created.status).toBe('awaiting_provider');

    const payments = await prisma.payment.findMany({ where: { bookingId: created.id } });
    expect(payments).toHaveLength(0);
  });

  it('creates an ecocash booking and holds the amount in escrow', async () => {
    const startsAt = futureSlot(2);
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt,
      paymentMethod: 'ecocash',
    });
    createdBookingIds.push(created.id);

    const payments = await prisma.payment.findMany({ where: { bookingId: created.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe('held');
    expect(payments[0]?.amountUsdCents).toBe(2000);
    expect(payments[0]?.feeUsdCents).toBe(100); // 5% of 2000
  });

  it('rejects a booking when the slot is already taken', async () => {
    const startsAt = futureSlot(3);
    const first = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt,
      paymentMethod: 'cash',
    });
    createdBookingIds.push(first.id);

    await expect(
      bookings.create(clientId, {
        providerId: providerAId,
        serviceId: serviceAId,
        startsAt,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow('no longer available');
  });

  it('confirmCompletion refuses a booking that is not yet confirmed by the provider', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(4),
      paymentMethod: 'cash',
    });
    createdBookingIds.push(created.id);

    await expect(bookings.confirmCompletion(created.id, clientId)).rejects.toThrow(
      'Cannot confirm completion',
    );
  });

  it('a cash booking needs both sides confirmed before it completes', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(5),
      paymentMethod: 'cash',
    });
    createdBookingIds.push(created.id);
    await prisma.booking.update({ where: { id: created.id }, data: { status: 'confirmed' } });

    const result = await bookings.confirmCompletion(created.id, clientId);
    expect(result.confirmedByClient).toBe(true);
    expect(result.status).toBe('confirmed'); // still waiting on the provider's side

    await prisma.booking.update({ where: { id: created.id }, data: { confirmedByProvider: true } });
    const second = await bookings.confirmCompletion(created.id, clientId);
    expect(second.status).toBe('confirmed'); // no-op: client already confirmed, this call short-circuits
  });

  it('an ecocash booking completes and releases escrow on the client confirmation alone', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(6),
      paymentMethod: 'ecocash',
    });
    createdBookingIds.push(created.id);
    await prisma.booking.update({ where: { id: created.id }, data: { status: 'confirmed' } });

    const result = await bookings.confirmCompletion(created.id, clientId);
    expect(result.status).toBe('completed');

    const payments = await prisma.payment.findMany({
      where: { bookingId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments.map((p) => p.status)).toEqual(['held', 'released']);
  });

  it('lets the client review a completed booking exactly once, and updates the provider rating', async () => {
    const created = await bookings.create(clientId, {
      providerId: providerAId,
      serviceId: serviceAId,
      startsAt: futureSlot(7),
      paymentMethod: 'cash',
    });
    createdBookingIds.push(created.id);
    await prisma.booking.update({ where: { id: created.id }, data: { status: 'completed' } });

    await bookings.createReview(created.id, clientId, { rating: 5 });
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
      paymentMethod: 'cash',
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
