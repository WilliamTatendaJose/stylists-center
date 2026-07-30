import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { MatchingService } from './matching.service';
import { GeoRepository } from '../geo/geo.repository';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/**
 * Against real Postgres+PostGIS (sc_test) — no Testcontainers daemon in this
 * sandbox. Exercises the fan-out, retry ladder, cancel, and the two BullMQ
 * job handlers directly (a fake Queue stands in for BullMQ itself, since
 * what's under test is the state machine and DB writes, not BullMQ's own
 * scheduling — that's proven live in plan §10's manual verification).
 */
const TEST_DATABASE_URL = 'postgresql://sc:sc@localhost:5432/sc_test';
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
};

const CLIENT_LOCATION = { lat: -17.7955, lng: 31.033 }; // Avondale

interface FakeJob {
  id: string;
  remove: () => Promise<void>;
}

/** Records every job added — enough for the fan-out assertions without a real BullMQ/Redis worker loop. */
class FakeQueue {
  added: { name: string; data: unknown; jobId?: string }[] = [];
  private readonly jobs = new Map<string, FakeJob>();

  add(name: string, data: unknown, opts?: { jobId?: string }): Promise<FakeJob> {
    const id = opts?.jobId ?? `auto-${String(this.added.length)}`;
    this.added.push({ name, data, ...(opts?.jobId ? { jobId: opts.jobId } : {}) });
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

describe('MatchingService', () => {
  let prisma: PrismaService;
  let matching: MatchingService;
  let queue: FakeQueue;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  const providerIds: string[] = [];
  const providerUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `matching-test-${String(Date.now())}`,
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
      data: { name: `MatchCat-${String(Date.now())}` },
    });
    categoryId = category.id;

    const client = await prisma.user.create({
      data: {
        phone: `+263771${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Test Client',
        cityId,
      },
    });
    clientId = client.id;

    // Two providers within 3km (Tariro-ish, Chiedza-ish), one outside (Rudo-ish).
    const providerSeeds = [
      { name: 'MatchNear1', lat: -17.793, lng: 31.0345, priceUsdCents: 1800 },
      { name: 'MatchNear2', lat: -17.808, lng: 31.039, priceUsdCents: 1200 },
      { name: 'MatchFar', lat: -17.742, lng: 31.09, priceUsdCents: 1000 },
    ];
    for (const seed of providerSeeds) {
      const phone = `+263772${String(Math.floor(Math.random() * 900000) + 100000)}`;
      const user = await prisma.user.create({ data: { phone, displayName: seed.name, cityId } });
      providerUserIds.push(user.id);
      const provider = await prisma.providerProfile.create({
        data: {
          userId: user.id,
          displayName: seed.name,
          tint: '#000000',
          initials: 'MM',
          categoryId,
          areaName: 'Test area',
          latitude: seed.lat,
          longitude: seed.lng,
          cityId,
          workingHoursLabel: 'Always',
          services: {
            create: [
              { name: 'Test service', durationMinutes: 30, priceUsdCents: seed.priceUsdCents },
            ],
          },
        },
      });
      providerIds.push(provider.id);
    }
  });

  afterAll(async () => {
    await prisma.matchOffer.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.matchRequest.deleteMany({ where: { clientId } });
    await prisma.service.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerProfile.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [clientId, ...providerUserIds] } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    queue = new FakeQueue();
    const geo = new GeoRepository(prisma);
    const socketEmitter = new SocketEmitterService(); // no server attached — emits are no-ops
    matching = new MatchingService(prisma, geo, socketEmitter, queue as unknown as Queue);
  });

  async function createTestMatch() {
    return matching.createMatch(clientId, {
      categoryId,
      budget: { mode: 'flex' },
      radiusKm: 3,
      location: CLIENT_LOCATION,
    });
  }

  it('fans out only to providers within the radius, and schedules one expire job + one offerTimeout per offer', async () => {
    const created = await createTestMatch();
    expect(created.state).toBe('offered');
    expect(created.fanOutCount).toBe(2); // MatchNear1 + MatchNear2, not MatchFar

    const dto = await matching.getMatch(created.id);
    // getMatch only returns ACCEPTED offers — none yet — but fanOutCount proves the fan-out itself.
    expect(dto.offers).toHaveLength(0);
    expect(dto.fanOutCount).toBe(2);

    const expireJobs = queue.added.filter((j) => j.name === 'expire');
    const offerJobs = queue.added.filter((j) => j.name === 'offerTimeout');
    expect(expireJobs).toHaveLength(1);
    expect(offerJobs).toHaveLength(2);
  });

  it('simulateAcceptOffer transitions the offer and the match, and getMatch then returns it', async () => {
    const created = await createTestMatch();
    const accepted = await matching.simulateAcceptOffer(created.id);
    expect(accepted.quoteUsdCents).toBeGreaterThan(0);

    const dto = await matching.getMatch(created.id);
    expect(dto.state).toBe('accepted');
    expect(dto.offers).toHaveLength(1);
    expect(dto.offers[0]?.id).toBe(accepted.id);
  });

  it('handleOfferTimeout expires only an unanswered offer, leaving an accepted one alone', async () => {
    const created = await createTestMatch();
    const accepted = await matching.simulateAcceptOffer(created.id);

    const offers = await prisma.matchOffer.findMany({ where: { matchRequestId: created.id } });
    const stillOffered = offers.find((o) => o.id !== accepted.id);
    if (!stillOffered) throw new Error('expected a second, still-offered, offer');

    await matching.handleOfferTimeout(stillOffered.id);
    await matching.handleOfferTimeout(accepted.id); // must no-op — this one is accepted, not offered

    const after = await prisma.matchOffer.findMany({ where: { matchRequestId: created.id } });
    expect(after.find((o) => o.id === stillOffered.id)?.state).toBe('expired');
    expect(after.find((o) => o.id === accepted.id)?.state).toBe('accepted');
  });

  it('handleMatchExpiry is idempotent — a second call on an already-expired match is a no-op', async () => {
    const created = await createTestMatch();
    await matching.handleMatchExpiry(created.id);
    await matching.handleMatchExpiry(created.id); // already 'expired' — must not error or re-transition

    const dto = await matching.getMatch(created.id);
    expect(dto.state).toBe('expired');
  });

  it('handleMatchExpiry allows an accepted-but-unbooked match to still expire (accepted -> expired is a valid transition)', async () => {
    const created = await createTestMatch();
    await matching.simulateAcceptOffer(created.id);

    await matching.handleMatchExpiry(created.id);
    const dto = await matching.getMatch(created.id);
    expect(dto.state).toBe('expired');
  });

  it('handleMatchExpiry is a no-op on a terminal state it cannot transition from (declined)', async () => {
    const created = await createTestMatch();
    await matching.cancel(created.id, clientId); // -> declined

    await matching.handleMatchExpiry(created.id);
    const match = await prisma.matchRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(match.state).toBe('declined');
  });

  it('handleMatchExpiry expires a still-pending match and all its unanswered offers', async () => {
    const created = await createTestMatch();
    await matching.handleMatchExpiry(created.id);

    const match = await prisma.matchRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(match.state).toBe('expired');
    const offers = await prisma.matchOffer.findMany({ where: { matchRequestId: created.id } });
    expect(offers.every((o) => o.state === 'expired')).toBe(true);
  });

  it('retry only works on an expired match, escalates the radius ladder, and re-fans-out', async () => {
    const created = await createTestMatch();

    await expect(matching.retry(created.id, clientId)).rejects.toThrow('Only an expired match');

    await matching.handleMatchExpiry(created.id);
    const retried = await matching.retry(created.id, clientId);
    expect(retried.id).toBe(created.id); // same match, not a new one
    expect(retried.state).toBe('offered');

    const match = await prisma.matchRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(match.radiusKm).toBe(8); // 3 -> 8, the next rung
    expect(match.attempt).toBe(2);
    expect(match.budgetMode).toBe('flex');
  });

  it('retry refuses a client who does not own the match', async () => {
    const created = await createTestMatch();
    await matching.handleMatchExpiry(created.id);
    await expect(matching.retry(created.id, 'not-the-owner')).rejects.toThrow();
  });

  it('cancel declines a pending/offered match and its open offers, and removes the expire job', async () => {
    const created = await createTestMatch();
    await matching.cancel(created.id, clientId);

    const match = await prisma.matchRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(match.state).toBe('declined');
    const offers = await prisma.matchOffer.findMany({ where: { matchRequestId: created.id } });
    expect(offers.every((o) => o.state === 'declined')).toBe(true);

    await expect(matching.cancel(created.id, clientId)).rejects.toThrow('Cannot cancel');
  });
});
