import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { AdminWalletService } from './admin-wallet.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/** Against real Postgres (sc_test) — same arrangement as wallet.service.spec.ts. */
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

describe('AdminWalletService', () => {
  let prisma: PrismaService;
  let adminWallet: AdminWalletService;
  let cityId: string;
  let agentUserId: string;
  let agentId: string;
  let creditTxnId: string;
  let cashOutTxnId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `admin-wallet-test-${String(Date.now())}`,
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

    const agentUser = await prisma.user.create({
      data: {
        phone: `+263781${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Cash Out Agent',
        cityId,
      },
    });
    agentUserId = agentUser.id;

    const agent = await prisma.agent.create({
      data: {
        userId: agentUserId,
        referralCode: `SC-CO${String(Date.now()).slice(-5)}`,
        verificationStatus: 'verified',
        status: 'active',
      },
    });
    agentId = agent.id;

    // Enough coins to clear CASH_OUT_MIN_USD_CENTS, then a real cash-out
    // request through WalletService so the row under test is produced the same
    // way production produces it, not hand-rolled to match the assertions.
    const credit = await prisma.walletTransaction.create({
      data: {
        userId: agentUserId,
        type: 'referral_coin',
        coins: 12,
        usdCents: 600,
        reference: 'Referral credit',
      },
    });
    creditTxnId = credit.id;

    const requested = await new WalletService(prisma).cashOut(agentUserId);
    cashOutTxnId = requested.id;
  });

  afterAll(async () => {
    // Settlements first: CashOutSettlement -> WalletTransaction is ON DELETE
    // RESTRICT, so the ledger rows cannot go while a settlement references one.
    await prisma.cashOutSettlement.deleteMany({
      where: { walletTransactionId: { in: [cashOutTxnId, creditTxnId] } },
    });
    await prisma.walletTransaction.deleteMany({ where: { userId: agentUserId } });
    await prisma.agent.delete({ where: { id: agentId } });
    await prisma.user.delete({ where: { id: agentUserId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    adminWallet = new AdminWalletService(prisma);
  });

  // listCashOuts is deliberately global (every stylist's requests, for one
  // admin queue), so these assertions find this spec's own row rather than
  // indexing into the list or counting it — otherwise they would depend on
  // what other specs happen to have left in the ledger.
  it('lists a pending cash-out with the requested amount as a positive number', async () => {
    const rows = await adminWallet.listCashOuts();
    const row = rows.find((r) => r.transactionId === cashOutTxnId);

    expect(row).toBeDefined();
    // The ledger row is stored negative (a debit); the admin queue shows what
    // is owed, so the sign is flipped on the way out.
    expect(row?.amountUsdCents).toBe(600);
    expect(row?.coins).toBe(12);
    expect(row?.displayName).toBe('Cash Out Agent');
    expect(row?.settled).toBe(false);
    expect(row?.settledAt).toBeNull();
    expect(row?.settledNote).toBeNull();
  });

  it('never returns the referral credit — only cash_out rows belong in the queue', async () => {
    const rows = await adminWallet.listCashOuts();
    expect(rows.some((r) => r.transactionId === creditTxnId)).toBe(false);
  });

  it('settling records the attestation and reports the row as paid', async () => {
    const settled = await adminWallet.settleCashOut(cashOutTxnId, { note: 'EcoCash ref 12345' });

    expect(settled.settled).toBe(true);
    expect(settled.settledNote).toBe('EcoCash ref 12345');
    expect(settled.settledAt).not.toBeNull();
    expect(settled.amountUsdCents).toBe(600);

    const rows = await adminWallet.listCashOuts();
    expect(rows.find((r) => r.transactionId === cashOutTxnId)?.settled).toBe(true);
  });

  it('leaves the coin ledger untouched when settling', async () => {
    // The whole point of a separate CashOutSettlement table (see the model's
    // doc comment): the ledger stays append-only and the balance does not move
    // just because an admin confirmed a transfer.
    const ledgerRow = await prisma.walletTransaction.findUniqueOrThrow({
      where: { id: cashOutTxnId },
    });
    expect(ledgerRow.coins).toBe(-12);
    expect(ledgerRow.usdCents).toBe(-600);
    expect(ledgerRow.type).toBe('cash_out');

    const balance = await new WalletService(prisma).getWallet(agentUserId);
    expect(balance.coins).toBe(0);
    expect(balance.usdCents).toBe(0);
  });

  it('refuses to settle the same cash-out twice', async () => {
    await expect(adminWallet.settleCashOut(cashOutTxnId, {})).rejects.toThrow('already settled');
  });

  it('refuses to settle a transaction that is not a cash-out', async () => {
    await expect(adminWallet.settleCashOut(creditTxnId, {})).rejects.toThrow('Not a cash-out');
  });

  it("surfaces the settled flag on the stylist's own transaction list", async () => {
    const transactions = await new WalletService(prisma).listTransactions(agentUserId);

    const cashOut = transactions.find((t) => t.id === cashOutTxnId);
    expect(cashOut?.settled).toBe(true);

    // `settled` is meaningless for anything that is not a withdrawal, and is
    // null rather than false so the UI can tell "not applicable" from "unpaid".
    const credit = transactions.find((t) => t.id === creditTxnId);
    expect(credit?.settled).toBeNull();
  });
});
