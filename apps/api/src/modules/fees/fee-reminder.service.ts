import { Injectable, Logger, Optional } from '@nestjs/common';
import { formatUsd } from '@sc/shared';
import type { FeeReminderKind } from '../../generated/prisma';
import { PushService } from '../notifications/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { DAY_MS, harareDayStart } from './fee-periods';
import { FeeStandingService } from './fee-standing.service';

const HARARE_OFFSET_MS = 2 * 60 * 60_000;

function harareDayLabel(at: Date): string {
  const local = new Date(at.getTime() + HARARE_OFFSET_MS);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${String(local.getUTCDate())} ${months[local.getUTCMonth()] ?? ''}`;
}

/**
 * Payment reminders for statements that still have a balance unpaid: some
 * days before the due date, on it, and some days after it. Each reminder is
 * sent once per statement; the (statement, kind) row is claimed before the
 * push goes out, so two job runs, or a retry, can never send it twice.
 */
@Injectable()
export class FeeReminderService {
  private readonly logger = new Logger(FeeReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly standing: FeeStandingService,
    private readonly push: PushService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** Sends whatever is due today. Returns how many reminders went out. */
  async sendDue(now: Date = new Date()): Promise<number> {
    const settings = this.settings ?? settingsFor(this.prisma);
    const [daysBefore, daysAfter, restrictDays] = await Promise.all([
      settings.get('feeReminderDaysBefore'),
      settings.get('feeReminderDaysAfter'),
      settings.get('feeRestrictAfterDays'),
    ]);
    const today = harareDayStart(now).getTime();

    let sent = 0;
    for (const statement of await this.standing.unpaidStatements()) {
      // Whole days from today to the due date: positive before it, 0 on it, negative after.
      const untilDue = Math.round((harareDayStart(statement.dueAt).getTime() - today) / DAY_MS);
      // The windows don't overlap, so at most one kind applies on any given day. A run
      // that was missed skips that day's reminder rather than sending a stale one, except
      // "overdue", which stays relevant for as long as the statement is unpaid.
      const kind: FeeReminderKind | null =
        untilDue >= 1 && untilDue <= daysBefore
          ? 'before_due'
          : untilDue <= 0 && untilDue > -daysAfter
            ? 'on_due'
            : untilDue <= -daysAfter
              ? 'overdue'
              : null;
      if (!kind) continue;

      const balance = await this.prisma.feeLedgerEntry.aggregate({
        where: { providerId: statement.providerId },
        _sum: { amountUsdCents: true },
      });
      const owed = Math.min(statement.unpaidUsdCents, balance._sum.amountUsdCents ?? 0);
      if (owed <= 0) continue;

      const { count } = await this.prisma.feeReminder.createMany({
        data: [{ statementId: statement.statementId, kind, sentAt: now }],
        skipDuplicates: true,
      });
      if (count === 0) continue;

      const provider = await this.prisma.providerProfile.findUnique({
        where: { id: statement.providerId },
        select: { userId: true },
      });
      if (!provider) continue;
      const due = harareDayLabel(statement.dueAt);
      const amount = formatUsd(owed);
      const restrictsAt = new Date(statement.dueAt.getTime() + restrictDays * DAY_MS);
      const overdueBody =
        restrictsAt.getTime() <= now.getTime()
          ? `Your account is paused until you pay the ${amount} in StylistsCenter fees you owe.`
          : `Your ${amount} in StylistsCenter fees was due on ${due}. Pay by ${harareDayLabel(restrictsAt)} to keep taking bookings and orders.`;
      const message = {
        before_due: {
          title: 'Fees due soon',
          body: `You owe StylistsCenter ${amount}, due on ${due}. You can pay in the app.`,
        },
        on_due: {
          title: 'Fees due today',
          body: `Your ${amount} in StylistsCenter fees is due today. You can pay in the app.`,
        },
        overdue: {
          title: 'Fees overdue',
          body: overdueBody,
        },
      }[kind];
      await this.push.sendToUser(provider.userId, {
        ...message,
        data: { type: 'fees.reminder' },
      });
      sent += 1;
    }
    if (sent > 0) this.logger.log(`Sent ${String(sent)} fee reminders`);
    return sent;
  }
}
