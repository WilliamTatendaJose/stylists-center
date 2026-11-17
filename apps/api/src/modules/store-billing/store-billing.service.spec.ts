import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { AppStoreClient } from './app-store.client';
import type { GooglePlayClient } from './google-play.client';
import { StoreBillingService } from './store-billing.service';
import type { StoreSubscriptionState } from './store-subscription';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  GOOGLE_PLAY_RTDN_TOKEN: 'rtdn-secret',
} as unknown as Env;

let counter = 0;
const uid = () => `${String(Date.now())}-${String(++counter)}`;
const IN_A_MONTH = new Date(Date.now() + 30 * 86_400_000);

describe('StoreBillingService', () => {
  let prisma: PrismaService;
  let cityId: string;
  const userIds: string[] = [];

  const play = (over: Partial<StoreSubscriptionState> = {}): StoreSubscriptionState => ({
    platform: 'google_play',
    externalId: `tok-${uid()}`,
    accountId: null,
    productId: 'agent_monthly',
    expiresAt: IN_A_MONTH,
    status: 'active',
    autoRenewing: true,
    latestOrderId: 'GPA.1',
    linkedExternalId: null,
    needsAcknowledgement: true,
    ...over,
  });

  const build = (state: () => StoreSubscriptionState) => {
    const google = {
      getSubscription: vi.fn(() => Promise.resolve(state())),
      acknowledge: vi.fn(() => Promise.resolve()),
    };
    const apple = { getSubscription: vi.fn(() => Promise.resolve(state())) };
    const service = new StoreBillingService(
      prisma,
      google as unknown as GooglePlayClient,
      apple as unknown as AppStoreClient,
      new ConfigService<Env, true>(ENV),
      new SettingsService(undefined, {}),
    );
    return { service, google, apple };
  };

  const makeAgent = async () => {
    const user = await prisma.user.create({
      data: { displayName: 'Store Agent', cityId, phone: `+2637${uid().slice(-8)}` },
    });
    userIds.push(user.id);
    const agent = await prisma.agent.create({
      data: { userId: user.id, referralCode: `SC-${uid()}`, verificationStatus: 'verified' },
    });
    return { userId: user.id, agentId: agent.id };
  };
  const paidUntil = async (agentId: string) =>
    (await prisma.agent.findUniqueOrThrow({ where: { id: agentId } })).subscriptionPaidUntil;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(ENV));
    await prisma.onModuleInit();
    cityId = (
      await prisma.city.create({
        data: {
          name: `store-billing-${uid()}`,
          timezone: 'Africa/Harare',
          centroidLat: -17.8,
          centroidLng: 31.03,
          bboxWest: 30.9,
          bboxSouth: -18,
          bboxEast: 31.2,
          bboxNorth: -17.6,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.storeSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.agent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('turns a verified Play purchase into a paid-up agent and acknowledges it', async () => {
    const { userId, agentId } = await makeAgent();
    const state = play({ accountId: userId });
    const { service, google } = build(() => state);
    const result = await service.verifyPurchase(userId, {
      platform: 'android',
      productId: 'agent_monthly',
      token: state.externalId,
    });
    expect(result.active).toBe(true);
    expect((await paidUntil(agentId))?.getTime()).toBe(IN_A_MONTH.getTime());
    expect(google.acknowledge).toHaveBeenCalledWith('agent_monthly', state.externalId);
  });

  it("refuses a purchase tagged for someone else's account", async () => {
    const { userId, agentId } = await makeAgent();
    const { service } = build(() => play({ accountId: 'someone-else' }));
    await expect(
      service.verifyPurchase(userId, {
        platform: 'android',
        productId: 'agent_monthly',
        token: 't',
      }),
    ).rejects.toThrow('another account');
    expect(await paidUntil(agentId)).toBeNull();
  });

  it('refuses a token already claimed by another agent', async () => {
    const first = await makeAgent();
    const second = await makeAgent();
    const shared = play();
    const { service } = build(() => shared);
    const input = { platform: 'android' as const, productId: 'agent_monthly', token: 'x' };
    await service.verifyPurchase(first.userId, input);
    await expect(service.verifyPurchase(second.userId, input)).rejects.toThrow('another account');
  });

  it('refuses another product, and an unpaid (pending) purchase grants nothing', async () => {
    const { userId, agentId } = await makeAgent();
    const { service } = build(() => play({ productId: 'other' }));
    await expect(
      service.verifyPurchase(userId, { platform: 'android', productId: 'other', token: 't' }),
    ).rejects.toThrow('not the agent subscription');
    const pending = build(() => play({ status: 'pending', accountId: userId }));
    await pending.service.verifyPurchase(userId, {
      platform: 'android',
      productId: 'agent_monthly',
      token: 't',
    });
    expect(await paidUntil(agentId)).toBeNull();
    expect(pending.google.acknowledge).not.toHaveBeenCalled();
  });

  it('never shortens a longer mobile-money period', async () => {
    const { userId, agentId } = await makeAgent();
    const later = new Date(Date.now() + 90 * 86_400_000);
    await prisma.agent.update({ where: { id: agentId }, data: { subscriptionPaidUntil: later } });
    const { service } = build(() => play({ accountId: userId }));
    await service.verifyPurchase(userId, {
      platform: 'android',
      productId: 'agent_monthly',
      token: 't',
    });
    expect((await paidUntil(agentId))?.getTime()).toBe(later.getTime());
  });

  it('extends on a Play renewal notification and ends access on a refund', async () => {
    const { userId, agentId } = await makeAgent();
    let state = play({ accountId: userId });
    const { service } = build(() => state);
    await service.verifyPurchase(userId, {
      platform: 'android',
      productId: 'agent_monthly',
      token: state.externalId,
    });
    const message = (token: string) => ({
      message: {
        data: Buffer.from(
          JSON.stringify({ subscriptionNotification: { purchaseToken: token } }),
        ).toString('base64'),
      },
    });

    await expect(
      service.handleGoogleNotification('wrong', message(state.externalId)),
    ).rejects.toThrow();

    const renewed = new Date(IN_A_MONTH.getTime() + 30 * 86_400_000);
    state = { ...state, expiresAt: renewed, needsAcknowledgement: false };
    await service.handleGoogleNotification('rtdn-secret', message(state.externalId));
    expect((await paidUntil(agentId))?.getTime()).toBe(renewed.getTime());

    state = { ...state, status: 'revoked' };
    await service.handleGoogleNotification('rtdn-secret', message(state.externalId));
    expect((await paidUntil(agentId))?.getTime() ?? 0).toBeLessThanOrEqual(Date.now());
  });

  it('checks an App Store purchase with Apple and refreshes it from a server notification', async () => {
    const { userId, agentId } = await makeAgent();
    let state = play({
      platform: 'app_store',
      externalId: `orig-${uid()}`,
      accountId: userId,
      needsAcknowledgement: false,
    });
    const { service, apple } = build(() => state);
    await service.verifyPurchase(userId, {
      platform: 'ios',
      productId: 'agent_monthly',
      token: '1002',
    });
    expect(apple.getSubscription).toHaveBeenCalledWith('1002', 'agent_monthly');
    expect((await paidUntil(agentId))?.getTime()).toBe(IN_A_MONTH.getTime());

    const renewed = new Date(IN_A_MONTH.getTime() + 30 * 86_400_000);
    state = { ...state, expiresAt: renewed };
    const jws = (payload: object) =>
      `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
    await service.handleAppleNotification({
      signedPayload: jws({ data: { signedTransactionInfo: jws({ transactionId: '1003' }) } }),
    });
    expect(apple.getSubscription).toHaveBeenLastCalledWith('1003', 'agent_monthly');
    expect((await paidUntil(agentId))?.getTime()).toBe(renewed.getTime());
  });
});
