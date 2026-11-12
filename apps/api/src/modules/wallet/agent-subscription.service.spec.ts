import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatusService } from '../payments/payment-status.service';
import type { PaymentGatewayPort } from '../payments/payment-gateway.port';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AdminVerificationsService } from '../admin-verifications/admin-verifications.service';
import type { ImageStorageService } from '../provider/image-storage.service';
import { AgentSubscriptionService } from './agent-subscription.service';
import { recordAgentSubscriptionPaymentStatus } from './agent-subscription-payment';

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
  PAYMENT_PROVIDER: 'paynow',
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

/** A gateway that answers whatever the test says it answers. */
function stubGateway(initial: 'held' | 'pending', polled = 'paid'): PaymentGatewayPort {
  return {
    createCheckout: (input) =>
      Promise.resolve({
        provider: 'paynow',
        status: initial,
        externalRef: `poll-${input.reference}`,
        instructions: 'Approve on your phone',
      }),
    verifyCallback: () => true,
    pollStatus: () => Promise.resolve(polled as 'paid'),
  };
}

describe('agent subscription', () => {
  let prisma: PrismaService;
  let cityId: string;
  const userIds: string[] = [];

  const makeAgent = async (opts: { verified?: boolean; recruiterAgentId?: string } = {}) => {
    const user = await prisma.user.create({
      data: {
        phone: `+2637${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`,
        displayName: 'Subscriber',
        cityId,
      },
    });
    userIds.push(user.id);
    const agent = await prisma.agent.create({
      data: {
        userId: user.id,
        referralCode: `SC-${uid()}`,
        verificationStatus: opts.verified === false ? 'pending' : 'verified',
      },
    });
    if (opts.recruiterAgentId) {
      await prisma.referral.create({
        data: {
          agentId: opts.recruiterAgentId,
          referredUserId: user.id,
          referredName: 'Subscriber',
          coinsAwarded: 6,
        },
      });
    }
    return { userId: user.id, agentId: agent.id };
  };
  const service = (gateway: PaymentGatewayPort) =>
    new AgentSubscriptionService(
      prisma,
      gateway,
      new PaymentStatusService(prisma, gateway),
      new SettingsService(undefined, {}),
    );
  const paidUntil = async (agentId: string) =>
    (await prisma.agent.findUniqueOrThrow({ where: { id: agentId } })).subscriptionPaidUntil;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(ENV));
    await prisma.onModuleInit();
    const city = await prisma.city.create({
      data: {
        name: `agentsub-test-${uid()}`,
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
    await prisma.payment.deleteMany({ where: { agent: { userId: { in: userIds } } } });
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.referral.deleteMany({ where: { agent: { userId: { in: userIds } } } });
    await prisma.agent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('starts inactive and costs the configured price', async () => {
    const agent = await makeAgent();
    expect(await service(stubGateway('pending')).get(agent.userId)).toEqual({
      priceUsdCents: 500,
      cycleDays: 30,
      paidUntil: null,
      active: false,
    });
  });

  it('refuses people who are not agents', async () => {
    const user = await prisma.user.create({
      data: {
        phone: `+2637${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`,
        displayName: 'Plain',
        cityId,
      },
    });
    userIds.push(user.id);
    await expect(service(stubGateway('pending')).get(user.id)).rejects.toThrow('Become an agent');
  });

  it('adds no cover while the payment is still pending', async () => {
    const agent = await makeAgent();
    const result = await service(stubGateway('pending')).pay(agent.userId, {});
    expect(result.pending).toBe(true);
    expect(await paidUntil(agent.agentId)).toBeNull();
    const payment = await prisma.payment.findFirstOrThrow({ where: { agentId: agent.agentId } });
    expect(payment).toMatchObject({
      amountUsdCents: 500,
      status: 'pending',
      subscriptionProviderId: null,
    });
  });

  it('adds 30 days once the gateway confirms through the poll, and only once', async () => {
    const agent = await makeAgent();
    const svc = service(stubGateway('pending', 'paid'));
    await svc.pay(agent.userId, {});
    const first = await svc.paymentStatus(agent.userId);
    expect(first).toMatchObject({ status: 'paid', active: true });
    const until = await paidUntil(agent.agentId);
    expect(Math.abs((until?.getTime() ?? 0) - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

    await svc.paymentStatus(agent.userId);
    expect((await paidUntil(agent.agentId))?.getTime()).toBe(until?.getTime());
  });

  it('settles at once when the gateway reports the money already held', async () => {
    const agent = await makeAgent();
    const result = await service(stubGateway('held')).pay(agent.userId, {});
    expect(result.pending).toBe(false);
    expect(result.paidUntil).not.toBeNull();
  });

  it('extends from the current expiry when renewing early', async () => {
    const agent = await makeAgent();
    const current = new Date(Date.now() + 10 * DAY);
    await prisma.agent.update({
      where: { id: agent.agentId },
      data: { subscriptionPaidUntil: current },
    });
    await service(stubGateway('held')).pay(agent.userId, {});
    expect((await paidUntil(agent.agentId))?.getTime()).toBe(current.getTime() + 30 * DAY);
  });

  it('a repeated or racing confirmation credits the payment once', async () => {
    const agent = await makeAgent();
    await service(stubGateway('pending')).pay(agent.userId, {});
    const payment = await prisma.payment.findFirstOrThrow({ where: { agentId: agent.agentId } });
    const confirm = () =>
      recordAgentSubscriptionPaymentStatus(prisma, {
        agentId: agent.agentId,
        reference: payment.reference ?? '',
        status: 'paid',
      });
    await Promise.all([confirm(), confirm()]);
    await confirm();
    const until = await paidUntil(agent.agentId);
    expect(Math.abs((until?.getTime() ?? 0) - (Date.now() + 30 * DAY))).toBeLessThan(60_000);
    expect(await prisma.payment.count({ where: { agentId: agent.agentId, status: 'paid' } })).toBe(
      1,
    );
  });

  it('a callback checks the amount, then credits the agent', async () => {
    const agent = await makeAgent();
    await service(stubGateway('pending')).pay(agent.userId, {});
    const payment = await prisma.payment.findFirstOrThrow({ where: { agentId: agent.agentId } });
    const payments = new PaymentsService(
      prisma,
      new ConfigService<Env, true>(ENV),
      stubGateway('pending'),
    );
    await expect(
      payments.receivePaynowCallback({
        reference: payment.reference ?? '',
        amount: '1.00',
        status: 'Paid',
      }),
    ).rejects.toThrow('amount mismatch');
    expect(await paidUntil(agent.agentId)).toBeNull();

    await payments.receivePaynowCallback({
      reference: payment.reference ?? '',
      amount: '5.00',
      status: 'Paid',
    });
    expect(await paidUntil(agent.agentId)).not.toBeNull();
  });

  describe('recruiter reward', () => {
    it('is paid when a verified recruit pays their first subscription', async () => {
      const recruiter = await makeAgent();
      const recruit = await makeAgent({ recruiterAgentId: recruiter.agentId });
      await service(stubGateway('held')).pay(recruit.userId, {});
      const rows = await prisma.walletTransaction.findMany({ where: { userId: recruiter.userId } });
      expect(rows).toMatchObject([{ type: 'referral_coin', pool: 'agent', coins: 6 }]);

      // A renewal does not pay again.
      await service(stubGateway('held')).pay(recruit.userId, {});
      expect(await prisma.walletTransaction.count({ where: { userId: recruiter.userId } })).toBe(1);
    });

    it('waits for verification when the recruit paid first, then pays on approval', async () => {
      const recruiter = await makeAgent();
      const recruit = await makeAgent({ verified: false, recruiterAgentId: recruiter.agentId });
      await service(stubGateway('held')).pay(recruit.userId, {});
      expect(await prisma.walletTransaction.count({ where: { userId: recruiter.userId } })).toBe(0);

      await prisma.user.update({
        where: { id: recruit.userId },
        data: { verificationStatus: 'pending', verificationSubmittedAt: new Date() },
      });
      const admin = new AdminVerificationsService(prisma, {
        remove: () => Promise.resolve(),
      } as unknown as ImageStorageService);
      await admin.review(recruit.userId, { verificationStatus: 'verified' });
      await admin.review(recruit.userId, { verificationStatus: 'verified' }).catch(() => undefined);
      const rows = await prisma.walletTransaction.findMany({ where: { userId: recruiter.userId } });
      expect(rows).toMatchObject([{ type: 'referral_coin', coins: 6 }]);
    });

    it('is not paid for someone who never subscribed', async () => {
      const recruiter = await makeAgent();
      await makeAgent({ recruiterAgentId: recruiter.agentId });
      expect(await prisma.walletTransaction.count({ where: { userId: recruiter.userId } })).toBe(0);
    });
  });
});
