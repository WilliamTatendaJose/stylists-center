import { Injectable, Optional } from '@nestjs/common';
import { formatInHarare } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { SettingsService, settingsFor } from '../settings/settings.service';

/**
 * Reminds agents to renew their subscription: once a few days before it ends
 * (setting agentSubscriptionReminderDays) and once on the day it ends. Runs
 * with the daily fee job. Each reminder is claimed with a conditional update
 * before it is sent, so repeated or concurrent runs send it once.
 */
@Injectable()
export class AgentSubscriptionReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async sendDue(now: Date = new Date()): Promise<number> {
    const days = await (this.settings ?? settingsFor(this.prisma)).get(
      'agentSubscriptionReminderDays',
    );
    const soon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    let sent = 0;

    const endingSoon = await this.prisma.agent.findMany({
      where: { subscriptionPaidUntil: { gt: now, lte: soon } },
      select: {
        id: true,
        userId: true,
        subscriptionPaidUntil: true,
        subscriptionReminderFor: true,
      },
    });
    for (const agent of endingSoon) {
      const until = agent.subscriptionPaidUntil;
      if (!until || agent.subscriptionReminderFor?.getTime() === until.getTime()) continue;
      const claimed = await this.prisma.agent.updateMany({
        where: {
          id: agent.id,
          subscriptionPaidUntil: until,
          OR: [{ subscriptionReminderFor: null }, { subscriptionReminderFor: { not: until } }],
        },
        data: { subscriptionReminderFor: until },
      });
      if (claimed.count !== 1) continue;
      await this.push.sendToUser(agent.userId, {
        title: 'Agent subscription ending soon',
        body: `Your agent subscription ends on ${formatInHarare(until.toISOString(), 'd MMM')}. Renew to keep earning rewards.`,
        data: { type: 'agent.subscription' },
      });
      sent += 1;
    }

    // Ended in the last day: tell them once.
    const ended = await this.prisma.agent.findMany({
      where: {
        subscriptionPaidUntil: { lte: now, gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        userId: true,
        subscriptionPaidUntil: true,
        subscriptionEndedNoticeFor: true,
      },
    });
    for (const agent of ended) {
      const until = agent.subscriptionPaidUntil;
      if (!until || agent.subscriptionEndedNoticeFor?.getTime() === until.getTime()) continue;
      const claimed = await this.prisma.agent.updateMany({
        where: {
          id: agent.id,
          subscriptionPaidUntil: until,
          OR: [
            { subscriptionEndedNoticeFor: null },
            { subscriptionEndedNoticeFor: { not: until } },
          ],
        },
        data: { subscriptionEndedNoticeFor: until },
      });
      if (claimed.count !== 1) continue;
      await this.push.sendToUser(agent.userId, {
        title: 'Agent subscription ended',
        body: 'Your agent subscription has ended. Renew it to keep earning and cashing out rewards.',
        data: { type: 'agent.subscription' },
      });
      sent += 1;
    }
    return sent;
  }
}
