import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/** Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox. */
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

describe('ReportsService', () => {
  let prisma: PrismaService;
  let reports: ReportsService;
  let cityId: string;
  let categoryId: string;
  let reporterId: string;
  let providerId: string;
  let providerUserId: string;
  let bookingId: string;
  let serviceId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `reports-test-${String(Date.now())}`,
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

    const category = await prisma.category.create({ data: { name: `ReportCat-${String(Date.now())}` } });
    categoryId = category.id;

    const reporter = await prisma.user.create({
      data: { phone: `+263781${String(Math.floor(Math.random() * 900000) + 100000)}`, displayName: 'Reporter', cityId },
    });
    reporterId = reporter.id;

    const providerUser = await prisma.user.create({
      data: { phone: `+263782${String(Math.floor(Math.random() * 900000) + 100000)}`, displayName: 'Reported Provider', cityId },
    });
    providerUserId = providerUser.id;
    const provider = await prisma.providerProfile.create({
      data: {
        userId: providerUser.id,
        displayName: 'Reported Provider',
        tint: '#333333',
        initials: 'RP',
        categoryId,
        areaName: 'Test area',
        latitude: -17.793,
        longitude: 31.0345,
        cityId,
        workingHoursLabel: 'Always',
        services: { create: [{ name: 'Test service', durationMinutes: 30, priceUsdCents: 1000 }] },
      },
      include: { services: true },
    });
    providerId = provider.id;
    const [service] = provider.services;
    if (!service) throw new Error('expected the seeded service to exist');
    serviceId = service.id;

    const booking = await prisma.booking.create({
      data: {
        reference: `SC-TEST${String(Date.now()).slice(-4)}`,
        clientId: reporterId,
        providerId,
        serviceId,
        startsAt: new Date(Date.now() - 24 * 60 * 60_000),
        paymentMethod: 'cash',
        status: 'completed',
        priceUsdCents: 1000,
      },
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { reporterId } });
    await prisma.booking.delete({ where: { id: bookingId } });
    await prisma.service.deleteMany({ where: { providerId } });
    await prisma.providerProfile.delete({ where: { id: providerId } });
    await prisma.user.deleteMany({ where: { id: { in: [reporterId, providerUserId] } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    reports = new ReportsService(prisma);
  });

  it('resolves providerId to the real reportedId (a User id), not the ProviderProfile id', async () => {
    await reports.create(reporterId, { providerId, reason: 'no_show' });

    const [report] = await prisma.report.findMany({ where: { reporterId } });
    expect(report?.reportedId).toBe(providerUserId);
    expect(report?.reason).toBe('no_show');
    expect(report?.status).toBe('open');
    expect(report?.bookingId).toBeNull();
  });

  it('attaches the bookingId when reporting from a completed booking', async () => {
    await reports.create(reporterId, { providerId, bookingId, reason: 'misconduct' });

    const report = await prisma.report.findFirst({ where: { reporterId, reason: 'misconduct' } });
    expect(report?.bookingId).toBe(bookingId);
  });

  it('rejects a report against a provider that does not exist', async () => {
    await expect(
      reports.create(reporterId, { providerId: '00000000-0000-4000-8000-000000000000', reason: 'other' }),
    ).rejects.toThrow('Provider not found');
  });
});
