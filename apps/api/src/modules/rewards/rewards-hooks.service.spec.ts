import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { addMonths, coinBalance } from './coin-ledger';
import { RewardsHooksService } from './rewards-hooks.service';

/** Against real Postgres, like the fee ledger spec: a rule here is a rule the database enforces. */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const ENV = {
  NODE_ENV: 'test',
  PORT: 4000,
  TRUST_PROXY_HOPS: 1,
  ADMIN_MFA_REQUIRED: false,
  DATABASE_URL,
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
  COIN_USD_CENTS: 10,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
  ANDROID_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=zw.co.stylistscenter.app',
} as Env;

const DAY = 24 * 60 * 60 * 1000;
let counter = 0;
const uid = () => `${String(Date.now())}-${String(++counter)}`;

describe('RewardsHooksService', () => {
  let prisma: PrismaService;
  let hooks: RewardsHooksService;
  let wallet: WalletService;
  let cityId: string;
  const userIds: string[] = [];

  const makeUser = async (name: string) => {
    const user = await prisma.user.create({
      data: {
        phone: `+2637${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`,
        displayName: name,
        cityId,
      },
    });
    userIds.push(user.id);
    return user.id;
  };
  const makeAgent = async (
    name: string,
    paidUntil: Date | null = new Date(Date.now() + 5 * DAY),
  ) => {
    const userId = await makeUser(name);
    const agent = await prisma.agent.create({
      data: {
        userId,
        referralCode: `SC-${uid()}`,
        verificationStatus: 'verified',
        subscriptionPaidUntil: paidUntil,
      },
    });
    return { userId, agentId: agent.id };
  };
  const inTx = <T>(
    fn: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<T>,
  ) => prisma.$transaction(fn);
  const rows = (userId: string) =>
    prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const balance = (userId: string) => coinBalance(prisma, userId, { agentActive: true });
  /** Gives a client `coins` spend-only coins expiring at `expiresAt`, as a completed booking would. */
  const earn = async (userId: string, coins: number, expiresAt: Date, createdAt?: Date) =>
    prisma.walletTransaction.create({
      data: {
        userId,
        type: 'booking_reward',
        pool: 'spend',
        coins,
        usdCents: coins * 10,
        expiresAt,
        remainingCoins: coins,
        dedupeKey: `test-earn:${uid()}`,
        ...(createdAt ? { createdAt } : {}),
      },
    });

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(ENV));
    await prisma.onModuleInit();
    const city = await prisma.city.create({
      data: {
        name: `rewards-test-${uid()}`,
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
  });

  afterAll(async () => {
    await prisma.walletCoinSpend.deleteMany({ where: { debit: { userId: { in: userIds } } } });
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.referral.deleteMany({ where: { agent: { userId: { in: userIds } } } });
    await prisma.agent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    const settings = new SettingsService(undefined, {});
    hooks = new RewardsHooksService(prisma, settings);
    wallet = new WalletService(prisma, settings);
  });

  describe('onBookingCompleted', () => {
    it('gives the client 1 coin per $10, expiring in 12 months, once per booking', async () => {
      const client = await makeUser('Client A');
      const input = { bookingId: `b-${uid()}`, clientId: client, amountPaidUsdCents: 2599 };
      await inTx((tx) => hooks.onBookingCompleted(tx, input));
      await inTx((tx) => hooks.onBookingCompleted(tx, input));

      const [row, ...rest] = await rows(client);
      expect(rest).toHaveLength(0);
      expect(row).toMatchObject({ type: 'booking_reward', pool: 'spend', coins: 2 });
      const months = addMonths(new Date(), 12).getTime();
      expect(Math.abs((row?.expiresAt?.getTime() ?? 0) - months)).toBeLessThan(60_000);
    });

    it('records nothing for a booking worth under one coin', async () => {
      const client = await makeUser('Client B');
      await inTx((tx) =>
        hooks.onBookingCompleted(tx, {
          bookingId: `b-${uid()}`,
          clientId: client,
          amountPaidUsdCents: 999,
        }),
      );
      expect(await rows(client)).toHaveLength(0);
    });

    it('does not abort the caller transaction when repeated inside it', async () => {
      const client = await makeUser('Client C');
      const input = { bookingId: `b-${uid()}`, clientId: client, amountPaidUsdCents: 5000 };
      await inTx(async (tx) => {
        await hooks.onBookingCompleted(tx, input);
        await hooks.onBookingCompleted(tx, input);
        // A caught unique violation would make this throw "transaction aborted".
        await tx.user.findUniqueOrThrow({ where: { id: client } });
      });
      expect(await rows(client)).toHaveLength(1);
    });
  });

  describe('reverseBookingReward', () => {
    it('takes back the coins a booking earned, once', async () => {
      const client = await makeUser('Client Rev1');
      const bookingId = `b-${uid()}`;
      await inTx((tx) =>
        hooks.onBookingCompleted(tx, { bookingId, clientId: client, amountPaidUsdCents: 3000 }),
      );
      expect((await balance(client)).spendable).toBe(3);

      expect(await inTx((tx) => hooks.reverseBookingReward(tx, { bookingId }))).toBe(3);
      expect(await inTx((tx) => hooks.reverseBookingReward(tx, { bookingId }))).toBe(0);
      expect((await balance(client)).spendable).toBe(0);
    });

    it('takes back only what is unspent: coins already spent stay spent', async () => {
      const client = await makeUser('Client Rev2');
      const stylist = await makeUser('Stylist Rev2');
      const bookingId = `b-${uid()}`;
      await inTx((tx) =>
        hooks.onBookingCompleted(tx, { bookingId, clientId: client, amountPaidUsdCents: 5000 }),
      );
      await inTx((tx) =>
        hooks.redeemForBooking(tx, {
          bookingId: `b-${uid()}`,
          clientId: client,
          providerUserId: stylist,
          coins: 2,
        }),
      );
      expect(await inTx((tx) => hooks.reverseBookingReward(tx, { bookingId }))).toBe(3);
      expect((await balance(client)).spendable).toBe(0);
      // The stylist keeps the 2 coins they were paid.
      expect((await balance(stylist)).cashOutable).toBe(2);
    });

    it('does nothing for a booking that earned no coins', async () => {
      expect(await inTx((tx) => hooks.reverseBookingReward(tx, { bookingId: `b-${uid()}` }))).toBe(
        0,
      );
    });
  });

  describe('onOrderCompleted', () => {
    it('pays the buyer, and the referring agent while subscribed and within the window', async () => {
      const agent = await makeAgent('Agent A');
      const buyer = await makeUser('Buyer A');
      await prisma.referral.create({
        data: {
          agentId: agent.agentId,
          referredUserId: buyer,
          referredName: 'Buyer A',
          coinsAwarded: 6,
        },
      });
      const input = { orderId: `o-${uid()}`, buyerId: buyer, productTotalUsdCents: 4500 };
      await inTx((tx) => hooks.onOrderCompleted(tx, input));
      await inTx((tx) => hooks.onOrderCompleted(tx, input));

      expect(await rows(buyer)).toMatchObject([
        { type: 'purchase_reward', pool: 'spend', coins: 4 },
      ]);
      expect(await rows(agent.userId)).toMatchObject([
        { type: 'referral_purchase', pool: 'agent', coins: 4 },
      ]);
    });

    it('pays the buyer but not an agent whose subscription has lapsed', async () => {
      const agent = await makeAgent('Agent B', new Date(Date.now() - DAY));
      const buyer = await makeUser('Buyer B');
      await prisma.referral.create({
        data: {
          agentId: agent.agentId,
          referredUserId: buyer,
          referredName: 'Buyer B',
          coinsAwarded: 6,
        },
      });
      await inTx((tx) =>
        hooks.onOrderCompleted(tx, {
          orderId: `o-${uid()}`,
          buyerId: buyer,
          productTotalUsdCents: 4500,
        }),
      );
      expect(await rows(buyer)).toHaveLength(1);
      expect(await rows(agent.userId)).toHaveLength(0);
    });

    it('pays no agent for an agent who never subscribed', async () => {
      const agent = await makeAgent('Agent C', null);
      const buyer = await makeUser('Buyer C');
      await prisma.referral.create({
        data: {
          agentId: agent.agentId,
          referredUserId: buyer,
          referredName: 'Buyer C',
          coinsAwarded: 6,
        },
      });
      await inTx((tx) =>
        hooks.onOrderCompleted(tx, {
          orderId: `o-${uid()}`,
          buyerId: buyer,
          productTotalUsdCents: 4500,
        }),
      );
      expect(await rows(agent.userId)).toHaveLength(0);
    });

    it('stops paying the agent 12 months after the buyer first used the code', async () => {
      const agent = await makeAgent('Agent D');
      const buyer = await makeUser('Buyer D');
      await prisma.referral.create({
        data: {
          agentId: agent.agentId,
          referredUserId: buyer,
          referredName: 'Buyer D',
          coinsAwarded: 6,
          createdAt: new Date(Date.now() - 400 * DAY),
        },
      });
      await inTx((tx) =>
        hooks.onOrderCompleted(tx, {
          orderId: `o-${uid()}`,
          buyerId: buyer,
          productTotalUsdCents: 4500,
        }),
      );
      expect(await rows(buyer)).toHaveLength(1);
      expect(await rows(agent.userId)).toHaveLength(0);
    });

    it('does not pay an agent for their own purchase', async () => {
      const agent = await makeAgent('Agent E');
      await prisma.referral.create({
        data: {
          agentId: agent.agentId,
          referredUserId: agent.userId,
          referredName: 'Agent E',
          coinsAwarded: 6,
        },
      });
      await inTx((tx) =>
        hooks.onOrderCompleted(tx, {
          orderId: `o-${uid()}`,
          buyerId: agent.userId,
          productTotalUsdCents: 4500,
        }),
      );
      expect((await rows(agent.userId)).map((r) => r.type)).toEqual(['purchase_reward']);
    });
  });

  describe('redeeming coins', () => {
    it('moves coins from the client to the stylist and returns their cash value', async () => {
      const client = await makeUser('Client R1');
      const stylist = await makeUser('Stylist R1');
      await earn(client, 5, new Date(Date.now() + 100 * DAY));
      const input = {
        bookingId: `b-${uid()}`,
        clientId: client,
        providerUserId: stylist,
        coins: 3,
      };

      const result = await inTx((tx) => hooks.redeemForBooking(tx, input));
      expect(result).toEqual({ usdCents: 30 });
      expect((await balance(client)).spendable).toBe(2);
      expect((await balance(stylist)).cashOutable).toBe(3);

      // Asking again for the same booking must not charge the client twice.
      expect(await inTx((tx) => hooks.redeemForBooking(tx, input))).toEqual({ usdCents: 30 });
      expect((await balance(client)).spendable).toBe(2);
      expect((await balance(stylist)).cashOutable).toBe(3);
    });

    it('refuses when the client has too few coins, and changes nothing', async () => {
      const client = await makeUser('Client R2');
      const stylist = await makeUser('Stylist R2');
      await earn(client, 2, new Date(Date.now() + 100 * DAY));
      await expect(
        inTx((tx) =>
          hooks.redeemForOrder(tx, {
            orderId: `o-${uid()}`,
            buyerId: client,
            vendorUserId: stylist,
            coins: 3,
          }),
        ),
      ).rejects.toThrow('Not enough coins');
      expect(await rows(stylist)).toHaveLength(0);
      expect((await balance(client)).spendable).toBe(2);
    });

    it('does not spend expired coins', async () => {
      const client = await makeUser('Client R3');
      const stylist = await makeUser('Stylist R3');
      await earn(client, 5, new Date(Date.now() - DAY));
      expect((await balance(client)).spendable).toBe(0);
      await expect(
        inTx((tx) =>
          hooks.redeemForBooking(tx, {
            bookingId: `b-${uid()}`,
            clientId: client,
            providerUserId: stylist,
            coins: 1,
          }),
        ),
      ).rejects.toThrow('Not enough coins');
    });

    it('spends the oldest coins first, and writes an expiry row for lapsed ones', async () => {
      const client = await makeUser('Client R4');
      const stylist = await makeUser('Stylist R4');
      const lapsed = await earn(client, 4, new Date(Date.now() - DAY));
      const soon = await earn(client, 3, new Date(Date.now() + 10 * DAY));
      const later = await earn(client, 5, new Date(Date.now() + 200 * DAY));

      await inTx((tx) =>
        hooks.redeemForBooking(tx, {
          bookingId: `b-${uid()}`,
          clientId: client,
          providerUserId: stylist,
          coins: 4,
        }),
      );
      const remaining = async (id: string) =>
        (await prisma.walletTransaction.findUniqueOrThrow({ where: { id } })).remainingCoins;
      expect(await remaining(lapsed.id)).toBe(0); // swept
      expect(await remaining(soon.id)).toBe(0);
      expect(await remaining(later.id)).toBe(4);
      expect((await rows(client)).filter((r) => r.type === 'expiry')).toHaveLength(1);
      expect((await balance(client)).spendable).toBe(4);
      expect((await balance(client)).nextExpiry?.coins).toBe(4);
    });

    it('lets a stylist spend coins they received from clients', async () => {
      const client = await makeUser('Client R5');
      const stylist = await makeUser('Stylist R5');
      const vendor = await makeUser('Vendor R5');
      await earn(client, 4, new Date(Date.now() + 100 * DAY));
      await inTx((tx) =>
        hooks.redeemForBooking(tx, {
          bookingId: `b-${uid()}`,
          clientId: client,
          providerUserId: stylist,
          coins: 4,
        }),
      );
      await inTx((tx) =>
        hooks.redeemForOrder(tx, {
          orderId: `o-${uid()}`,
          buyerId: stylist,
          vendorUserId: vendor,
          coins: 3,
        }),
      );
      expect((await balance(stylist)).cashOutable).toBe(1);
      expect((await balance(vendor)).cashOutable).toBe(3);
    });

    it('two simultaneous redemptions of the same coins: only one wins', async () => {
      const client = await makeUser('Client R6');
      const stylist = await makeUser('Stylist R6');
      await earn(client, 3, new Date(Date.now() + 100 * DAY));
      const attempt = () =>
        inTx((tx) =>
          hooks.redeemForBooking(tx, {
            bookingId: `b-${uid()}`,
            clientId: client,
            providerUserId: stylist,
            coins: 3,
          }),
        );
      const results = await Promise.allSettled([attempt(), attempt()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await balance(client)).spendable).toBe(0);
      expect((await balance(stylist)).cashOutable).toBe(3);
    });

    it('clients cannot cash out coins they earned', async () => {
      const client = await makeUser('Client R7');
      await earn(client, 100, new Date(Date.now() + 100 * DAY));
      expect((await balance(client)).cashOutable).toBe(0);
      await expect(wallet.cashOut(client)).rejects.toThrow('cash out');
    });
  });

  describe('refundRedemption', () => {
    it('returns the client coins to their original rows and takes them back from the stylist, once', async () => {
      const client = await makeUser('Client F1');
      const stylist = await makeUser('Stylist F1');
      const expiresAt = new Date(Date.now() + 30 * DAY);
      const lot = await earn(client, 6, expiresAt);
      const bookingId = `b-${uid()}`;
      await inTx((tx) =>
        hooks.redeemForBooking(tx, {
          bookingId,
          clientId: client,
          providerUserId: stylist,
          coins: 4,
        }),
      );
      await inTx((tx) => hooks.refundRedemption(tx, { bookingId }));
      await inTx((tx) => hooks.refundRedemption(tx, { bookingId }));

      const after = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: lot.id } });
      expect(after.remainingCoins).toBe(6);
      expect(after.expiresAt?.getTime()).toBe(expiresAt.getTime());
      expect((await balance(client)).spendable).toBe(6);
      expect((await balance(stylist)).cashOutable).toBe(0);
      await expect(
        inTx((tx) =>
          hooks.redeemForBooking(tx, {
            bookingId,
            clientId: client,
            providerUserId: stylist,
            coins: 4,
          }),
        ),
      ).rejects.toThrow('already returned');
    });

    it('does nothing for a booking that used no coins', async () => {
      await expect(
        inTx((tx) => hooks.refundRedemption(tx, { orderId: `o-${uid()}` })),
      ).resolves.toBeUndefined();
    });
  });

  describe('recruiting an agent', () => {
    const setup = async (recruitPaid: boolean, recruitVerified: boolean) => {
      const recruiter = await makeAgent('Recruiter');
      const recruitUser = await makeUser('Recruit');
      await prisma.agent.create({
        data: {
          userId: recruitUser,
          referralCode: `SC-${uid()}`,
          verificationStatus: recruitVerified ? 'verified' : 'pending',
          subscriptionPaidUntil: recruitPaid ? new Date(Date.now() + 5 * DAY) : null,
        },
      });
      await prisma.referral.create({
        data: {
          agentId: recruiter.agentId,
          referredUserId: recruitUser,
          referredName: 'Recruit',
          coinsAwarded: 6,
        },
      });
      return { recruiter, recruitUser };
    };

    it('pays the recruiter 6 coins once, when verified and paid, whichever came last', async () => {
      const { recruiter, recruitUser } = await setup(true, true);
      await inTx((tx) => hooks.onAgentMilestone(tx, recruitUser));
      await inTx((tx) => hooks.onAgentMilestone(tx, recruitUser));
      expect(await rows(recruiter.userId)).toMatchObject([
        { type: 'referral_coin', pool: 'agent', coins: 6 },
      ]);
      const referral = await prisma.referral.findUniqueOrThrow({
        where: { referredUserId: recruitUser },
      });
      expect(referral.status).toBe('paid');
    });

    it('waits while the recruit has not paid', async () => {
      const { recruiter, recruitUser } = await setup(false, true);
      await inTx((tx) => hooks.onAgentMilestone(tx, recruitUser));
      expect(await rows(recruiter.userId)).toHaveLength(0);
    });

    it('waits while the recruit is not verified', async () => {
      const { recruiter, recruitUser } = await setup(true, false);
      await inTx((tx) => hooks.onAgentMilestone(tx, recruitUser));
      expect(await rows(recruiter.userId)).toHaveLength(0);
    });
  });

  describe('cash-out rules', () => {
    it('lets a stylist cash out received coins, then blocks another request for 30 days', async () => {
      const client = await makeUser('Client C1');
      const stylist = await makeUser('Stylist C1');
      await earn(client, 120, new Date(Date.now() + 100 * DAY));
      await inTx((tx) =>
        hooks.redeemForBooking(tx, {
          bookingId: `b-${uid()}`,
          clientId: client,
          providerUserId: stylist,
          coins: 60,
        }),
      );
      const before = await wallet.getWallet(stylist);
      expect(before).toMatchObject({ cashOutableCoins: 60, spendableCoins: 60, canCashOut: true });

      const result = await wallet.cashOut(stylist);
      expect(result.amountUsdCents).toBe(600);
      const txns = await wallet.listTransactions(stylist);
      expect(txns.find((t) => t.type === 'cash_out')?.pool).toBe('cash');

      // Receive more, then try again straight away.
      await inTx((tx) =>
        hooks.redeemForBooking(tx, {
          bookingId: `b-${uid()}`,
          clientId: client,
          providerUserId: stylist,
          coins: 60,
        }),
      );
      const waiting = await wallet.getWallet(stylist);
      expect(waiting.canCashOut).toBe(false);
      expect(waiting.nextCashOutAt).not.toBeNull();
      await expect(wallet.cashOut(stylist)).rejects.toThrow('You can cash out again on');
    });

    it('keeps agent earnings locked until the subscription is active', async () => {
      const agent = await makeAgent('Agent L', new Date(Date.now() - DAY));
      await prisma.walletTransaction.create({
        data: {
          userId: agent.userId,
          type: 'referral_purchase',
          pool: 'agent',
          coins: 80,
          usdCents: 800,
        },
      });
      const locked = await wallet.getWallet(agent.userId);
      expect(locked).toMatchObject({
        coins: 80,
        cashOutableCoins: 0,
        lockedAgentCoins: 80,
        canCashOut: false,
      });
      await expect(wallet.cashOut(agent.userId)).rejects.toThrow('agent subscription');

      await prisma.agent.update({
        where: { id: agent.agentId },
        data: { subscriptionPaidUntil: new Date(Date.now() + 5 * DAY) },
      });
      const result = await wallet.cashOut(agent.userId);
      expect(result.amountUsdCents).toBe(800);
    });

    it('counts only cash-out-able coins towards the minimum, and reports the next expiry', async () => {
      const agent = await makeAgent('Agent M');
      const expiresAt = new Date(Date.now() + 20 * DAY);
      await earn(agent.userId, 100, expiresAt); // spend-only: does not help
      await prisma.walletTransaction.create({
        data: {
          userId: agent.userId,
          type: 'referral_purchase',
          pool: 'agent',
          coins: 20,
          usdCents: 200,
        },
      });
      const dto = await wallet.getWallet(agent.userId);
      expect(dto).toMatchObject({
        coins: 120,
        spendableCoins: 100,
        cashOutableCoins: 20,
        nextExpiryCoins: 100,
        canCashOut: false,
      });
      expect(dto.nextExpiryAt).toBe(expiresAt.toISOString());
      await expect(wallet.cashOut(agent.userId)).rejects.toThrow('Balance must exceed');
    });
  });
});
