import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/** Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox. */
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
  ANDROID_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=zw.co.stylistscenter.app',
};

describe('WalletService', () => {
  let prisma: PrismaService;
  let config: ConfigService<Env, true>;
  let wallet: WalletService;
  let cityId: string;
  let plainUserId: string;
  let agentUserId: string;
  let agentId: string;

  beforeAll(async () => {
    config = new ConfigService<Env, true>(BASE_ENV);
    prisma = new PrismaService(config);
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `wallet-test-${String(Date.now())}`,
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

    const plainUser = await prisma.user.create({
      data: {
        phone: `+263779${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Plain User',
        cityId,
      },
    });
    plainUserId = plainUser.id;

    const agentUser = await prisma.user.create({
      data: {
        phone: `+263780${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Agent User',
        cityId,
      },
    });
    agentUserId = agentUser.id;
    const agent = await prisma.agent.create({
      data: {
        userId: agentUserId,
        referralCode: `SC-TEST${String(Date.now()).slice(-4)}`,
        verificationStatus: 'verified',
        status: 'active',
      },
    });
    agentId = agent.id;

    await prisma.referral.create({
      data: { agentId, referredName: 'Referred Salon', coinsAwarded: 6, status: 'paid' },
    });
    await prisma.referral.create({
      data: { agentId, referredName: 'Second Referral', coinsAwarded: 6, status: 'paid' },
    });
    await prisma.walletTransaction.create({
      data: {
        userId: agentUserId,
        type: 'referral_coin',
        coins: 6,
        usdCents: 300,
        reference: 'Referred Salon',
      },
    });
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({
      where: { userId: { in: [plainUserId, agentUserId] } },
    });
    await prisma.referral.deleteMany({ where: { agentId } });
    await prisma.agent.delete({ where: { id: agentId } });
    await prisma.user.deleteMany({ where: { id: { in: [plainUserId, agentUserId] } } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    wallet = new WalletService(prisma, config);
  });

  it('a plain (non-agent) user has an empty, non-cash-out-able wallet', async () => {
    const dto = await wallet.getWallet(plainUserId);
    expect(dto.coins).toBe(0);
    expect(dto.usdCents).toBe(0);
    expect(dto.isVerifiedAgent).toBe(false);
    expect(dto.canCashOut).toBe(false);
    expect(dto.referralCode).toBe('');
  });

  it('repairs a paid referral missing from the ledger and lists the commissions', async () => {
    const dto = await wallet.getWallet(agentUserId);
    expect(dto.coins).toBe(12);
    expect(dto.usdCents).toBe(600);
    expect(dto.isVerifiedAgent).toBe(true);
    expect(dto.canCashOut).toBe(true); // 600 > CASH_OUT_MIN_USD_CENTS (500)

    const referrals = await wallet.listReferrals(agentUserId);
    expect(referrals).toHaveLength(2);
    expect(referrals[0]?.referredName).toBe('Referred Salon');
  });

  it('cashOut zeroes the balance via a new ledger row, never mutating the held ones', async () => {
    const result = await wallet.cashOut(agentUserId);
    expect(result.amountUsdCents).toBe(600);
    expect(result.status).toBe('pending');

    const after = await wallet.getWallet(agentUserId);
    expect(after.coins).toBe(0);
    expect(after.usdCents).toBe(0);

    const transactions = await prisma.walletTransaction.findMany({
      where: { userId: agentUserId },
    });
    expect(transactions).toHaveLength(3); // two referral credits, then this cash_out debit
  });

  it('cashOut refuses a balance at or below the minimum', async () => {
    await expect(wallet.cashOut(plainUserId)).rejects.toThrow('cash out');
  });
});
