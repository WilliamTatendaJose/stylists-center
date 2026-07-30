import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { GeoRepository } from './geo.repository';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/**
 * Against real Postgres+PostGIS (sc_test) — no Testcontainers daemon in this
 * sandbox. This is the automated version of the plan §10 verification check:
 * a 3km search around Avondale must return Tariro/Chiedza/Kudzai sorted by
 * distance and exclude Rudo (Borrowdale, ~8.5km), proving the generated
 * geography column + GIST index are actually wired, not just present.
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

describe('GeoRepository', () => {
  let prisma: PrismaService;
  let geo: GeoRepository;
  let cityId: string;
  let hairId: string;
  let nailsId: string;
  let barberId: string;

  const providerIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();
    geo = new GeoRepository(prisma);

    const city = await prisma.city.create({
      data: {
        name: `geo-test-${String(Date.now())}`,
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

    const [hair, nails, barber] = await Promise.all([
      prisma.category.create({ data: { name: `Hair-${String(Date.now())}` } }),
      prisma.category.create({ data: { name: `Nails-${String(Date.now())}` } }),
      prisma.category.create({ data: { name: `Barber-${String(Date.now())}` } }),
    ]);
    hairId = hair.id;
    nailsId = nails.id;
    barberId = barber.id;

    const providerSeeds = [
      { name: 'TestTariro', categoryId: hairId, lat: -17.793, lng: 31.0345 }, // ~0.3km
      { name: 'TestChiedza', categoryId: hairId, lat: -17.812, lng: 31.025 }, // ~2.0km
      { name: 'TestKudzai', categoryId: nailsId, lat: -17.808, lng: 31.039 }, // ~1.5km
      { name: 'TestRudo', categoryId: barberId, lat: -17.742, lng: 31.09 }, // ~8.5km
    ];

    for (const seed of providerSeeds) {
      const phone = `+2637700${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      const user = await prisma.user.create({
        data: { phone, displayName: seed.name, cityId },
      });
      userIds.push(user.id);
      const provider = await prisma.providerProfile.create({
        data: {
          userId: user.id,
          displayName: seed.name,
          tint: '#000000',
          initials: 'TT',
          categoryId: seed.categoryId,
          areaName: 'Test area',
          latitude: seed.lat,
          longitude: seed.lng,
          cityId,
          workingHoursLabel: 'Always',
        },
      });
      providerIds.push(provider.id);
    }
  });

  afterAll(async () => {
    await prisma.providerProfile.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.category.deleteMany({ where: { id: { in: [hairId, nailsId, barberId] } } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('returns only providers within the radius, nearest first', async () => {
    const rows = await geo.findProvidersWithinRadius(CLIENT_LOCATION.lat, CLIENT_LOCATION.lng, 3);
    const names = rows.map((r) => r.displayName);

    expect(names).toEqual(['TestTariro', 'TestKudzai', 'TestChiedza']);
    expect(names).not.toContain('TestRudo');
  });

  it('returns all providers, unfiltered, when radiusKm is null (Home\'s "available" list)', async () => {
    const rows = await geo.findProvidersWithinRadius(CLIENT_LOCATION.lat, CLIENT_LOCATION.lng, null);
    expect(rows.map((r) => r.displayName)).toContain('TestRudo');
  });

  it('filters by category alongside radius', async () => {
    const rows = await geo.findProvidersWithinRadius(
      CLIENT_LOCATION.lat,
      CLIENT_LOCATION.lng,
      3,
      nailsId,
    );
    expect(rows.map((r) => r.displayName)).toEqual(['TestKudzai']);
  });

  it('counts providers per category within the radius', async () => {
    const counts = await geo.countProvidersByCategory(CLIENT_LOCATION.lat, CLIENT_LOCATION.lng, 3);
    expect(counts.get(hairId)).toBe(2);
    expect(counts.get(nailsId)).toBe(1);
    expect(counts.has(barberId)).toBe(false);
  });

  it('findProviderById returns the correct distance', async () => {
    const tariroId = providerIds[0];
    if (!tariroId) throw new Error('missing seeded provider id');
    const row = await geo.findProviderById(tariroId, CLIENT_LOCATION.lat, CLIENT_LOCATION.lng);
    expect(row?.displayName).toBe('TestTariro');
    expect(row?.distanceKm).toBeLessThan(1);
  });
});
