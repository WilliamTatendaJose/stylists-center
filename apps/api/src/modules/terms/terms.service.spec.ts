import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { TermsService } from './terms.service';
import type { Env } from '../../config/env';

/** Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox. */
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

const DOC_KEYS = ['terms-clients', 'terms-stylists', 'terms-agents', 'privacy'];

describe('TermsService', () => {
  let prisma: PrismaService;
  let terms: TermsService;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  let stylistId: string;
  let agentId: string;

  beforeAll(async () => {
    const config = new ConfigService<Env, true>(BASE_ENV);
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    terms = new TermsService(prisma);

    const suffix = String(Date.now());
    cityId = (
      await prisma.city.create({
        data: {
          name: `terms-test-${suffix}`,
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
    categoryId = (await prisma.category.create({ data: { name: `TermsCat-${suffix}` } })).id;

    const phone = (n: number) => `+263771${String(100000 + n)}`;
    clientId = (
      await prisma.user.create({
        data: { phone: phone(1), displayName: 'Terms Client', cityId },
      })
    ).id;
    stylistId = (
      await prisma.user.create({
        data: { phone: phone(2), displayName: 'Terms Stylist', cityId },
      })
    ).id;
    await prisma.providerProfile.create({
      data: {
        userId: stylistId,
        displayName: 'Terms Stylist',
        tint: '#111111',
        initials: 'TS',
        categoryId,
        areaName: 'Test area',
        latitude: -17.8,
        longitude: 31.03,
        cityId,
        workingHoursLabel: 'Weekdays',
      },
    });
    const agentUserId = (
      await prisma.user.create({
        data: { phone: phone(3), displayName: 'Terms Agent', cityId },
      })
    ).id;
    agentId = (
      await prisma.agent.create({
        data: { userId: agentUserId, referralCode: `TERMS${suffix}` },
      })
    ).id;
  });

  beforeEach(async () => {
    // Each test starts with no published terms, the same state as a fresh install.
    await prisma.termsAcceptance.deleteMany({
      where: { userId: { in: [clientId, stylistId] } },
    });
    await prisma.contentDocument.deleteMany({ where: { key: { in: DOC_KEYS } } });
  });

  afterAll(async () => {
    await prisma.termsAcceptance.deleteMany({
      where: { userId: { in: [clientId, stylistId] } },
    });
    await prisma.contentDocument.deleteMany({ where: { key: { in: DOC_KEYS } } });
    await prisma.agent.delete({ where: { id: agentId } });
    await prisma.providerProfile.delete({ where: { userId: stylistId } });
    await prisma.user.deleteMany({
      where: { cityId },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.$disconnect();
  });

  /** Staff save: the first save creates the row at version 1, later saves bump it. */
  async function publish(key: string) {
    await prisma.contentDocument.upsert({
      where: { key },
      create: { key, title: `Title ${key}`, body: 'Text' },
      update: { version: { increment: 1 } },
    });
    return (await prisma.contentDocument.findUniqueOrThrow({ where: { key } })).version;
  }

  it('needs no acceptance while a document is still the placeholder', async () => {
    const status = await terms.status(clientId);
    expect(status.map((d) => d.key)).toEqual(['terms-clients', 'privacy']);
    expect(status.every((d) => d.version === 0 && d.accepted)).toBe(true);
  });

  it('asks the user to accept once staff publish version 1, then clears', async () => {
    await publish('terms-clients');
    await publish('privacy');

    let status = await terms.status(clientId);
    expect(status.find((d) => d.key === 'terms-clients')).toMatchObject({
      version: 1,
      accepted: false,
      title: 'Title terms-clients',
    });

    status = await terms.accept(clientId, { key: 'terms-clients', version: 1 });
    expect(status.find((d) => d.key === 'terms-clients')?.accepted).toBe(true);
    expect(status.find((d) => d.key === 'privacy')?.accepted).toBe(false);
  });

  it('asks again when staff publish a new version', async () => {
    await publish('terms-clients');
    await terms.accept(clientId, { key: 'terms-clients', version: 1 });

    await publish('terms-clients');
    const status = await terms.status(clientId);
    expect(status.find((d) => d.key === 'terms-clients')).toMatchObject({
      version: 2,
      accepted: false,
    });
  });

  it('rejects accepting an old or unpublished version', async () => {
    await publish('terms-clients');
    await publish('terms-clients');

    await expect(
      terms.accept(clientId, { key: 'terms-clients', version: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      terms.accept(clientId, { key: 'terms-clients', version: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
    const status = await terms.status(clientId);
    expect(status.find((d) => d.key === 'terms-clients')?.accepted).toBe(false);
  });

  it('rejects accepting a placeholder that has not been published', async () => {
    await expect(terms.accept(clientId, { key: 'privacy', version: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('adds the stylist terms for a provider profile and rejects them for a client', async () => {
    await publish('terms-stylists');

    const stylistKeys = (await terms.status(stylistId)).map((d) => d.key);
    expect(stylistKeys).toEqual(['terms-clients', 'privacy', 'terms-stylists']);
    expect(stylistKeys).not.toContain('terms-agents');

    await expect(
      terms.accept(clientId, { key: 'terms-stylists', version: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await terms.accept(stylistId, { key: 'terms-stylists', version: 1 });
    const status = await terms.status(stylistId);
    expect(status.find((d) => d.key === 'terms-stylists')?.accepted).toBe(true);
  });

  it('adds the agent terms for an agent', async () => {
    const agentUserId = (await prisma.agent.findUniqueOrThrow({ where: { id: agentId } })).userId;
    await publish('terms-agents');
    const keys = (await terms.status(agentUserId)).map((d) => d.key);
    expect(keys).toEqual(['terms-clients', 'privacy', 'terms-agents']);
  });

  it('accepting the same version twice is fine and keeps one row', async () => {
    await publish('privacy');
    await terms.accept(clientId, { key: 'privacy', version: 1 });
    const again = await terms.accept(clientId, { key: 'privacy', version: 1 });

    expect(again.find((d) => d.key === 'privacy')?.accepted).toBe(true);
    const rows = await prisma.termsAcceptance.count({
      where: { userId: clientId, key: 'privacy', version: 1 },
    });
    expect(rows).toBe(1);
  });
});
