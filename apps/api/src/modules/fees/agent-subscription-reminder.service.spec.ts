import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import type { PushService } from '../notifications/push.service';
import { SettingsService } from '../settings/settings.service';
import { AgentSubscriptionReminderService } from './agent-subscription-reminder.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const DAY = 24 * 60 * 60 * 1000;

describe('AgentSubscriptionReminderService', () => {
  let prisma: PrismaService;
  let cityId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' }),
    );
    await prisma.onModuleInit();
    cityId = (
      await prisma.city.create({
        data: {
          name: `agent-rem-${randomUUID().slice(0, 8)}`,
          timezone: 'Africa/Harare',
          centroidLat: -17.8,
          centroidLng: 31.0,
          bboxWest: 30.9,
          bboxSouth: -18,
          bboxEast: 31.2,
          bboxNorth: -17.6,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.agent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  async function agentEnding(at: Date): Promise<string> {
    const user = await prisma.user.create({
      data: {
        phone: `+263783${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Agent',
        cityId,
      },
    });
    userIds.push(user.id);
    await prisma.agent.create({
      data: {
        userId: user.id,
        referralCode: `R${randomUUID().slice(0, 7)}`,
        subscriptionPaidUntil: at,
      },
    });
    return user.id;
  }

  it('reminds once before the end and once when it ends, per period', async () => {
    const now = new Date();
    const soonUser = await agentEnding(new Date(now.getTime() + 2 * DAY));
    const laterUser = await agentEnding(new Date(now.getTime() + 10 * DAY));
    const endedUser = await agentEnding(new Date(now.getTime() - 2 * 60 * 60 * 1000));
    const sendToUser = vi.fn().mockResolvedValue(undefined);
    const service = new AgentSubscriptionReminderService(
      prisma,
      { sendToUser } as unknown as PushService,
      new SettingsService(undefined, { AGENT_SUBSCRIPTION_REMINDER_DAYS: '3' }),
    );

    await service.sendDue(now);
    await service.sendDue(now); // a repeated run sends nothing new

    const to = (id: string) => sendToUser.mock.calls.filter(([userId]) => userId === id);
    expect(to(soonUser)).toHaveLength(1);
    expect(to(soonUser)[0]?.[1]).toMatchObject({ title: 'Agent subscription ending soon' });
    expect(to(endedUser)).toHaveLength(1);
    expect(to(endedUser)[0]?.[1]).toMatchObject({ title: 'Agent subscription ended' });
    expect(to(laterUser)).toHaveLength(0);

    // Renewing starts a new period, which gets its own reminder.
    await prisma.agent.update({
      where: { userId: soonUser },
      data: { subscriptionPaidUntil: new Date(now.getTime() + 2.5 * DAY) },
    });
    await service.sendDue(now);
    expect(to(soonUser)).toHaveLength(2);
  });
});
