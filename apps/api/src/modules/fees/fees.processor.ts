import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { FEES_QUEUE } from '../jobs/jobs.module';
import { harareDayStart } from './fee-periods';
import { FeeReminderService } from './fee-reminder.service';
import { AgentSubscriptionReminderService } from './agent-subscription-reminder.service';
import { FeeStatementService } from './fee-statement.service';

const DAILY_JOB = 'daily';

/**
 * The daily fee run: statements for any finished month that lacks one, then
 * the day's payment reminders. Both steps are idempotent and catch up on
 * their own, so a missed or repeated run is harmless.
 */
@Injectable()
@Processor(FEES_QUEUE)
export class FeesProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeesProcessor.name);

  constructor(
    @InjectQueue(FEES_QUEUE) private readonly queue: Queue,
    private readonly statements: FeeStatementService,
    private readonly reminders: FeeReminderService,
    @Optional() private readonly agentReminders?: AgentSubscriptionReminderService,
  ) {
    super();
  }

  /**
   * Registers the schedule (once, however many API instances start: the
   * scheduler id is the key) and queues one run for today, so a deploy or
   * restart after an outage catches up straight away rather than at the
   * next scheduled time. Redis being down must not stop the API starting.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      // 00:30 Harare: shortly after a month ends, so statements are ready first thing.
      await this.queue.upsertJobScheduler(
        'fees-daily',
        { pattern: '30 0 * * *', tz: 'Africa/Harare' },
        { name: DAILY_JOB, opts: { removeOnComplete: true, removeOnFail: 50 } },
      );
      const today = harareDayStart(new Date()).toISOString().slice(0, 10);
      await this.queue.add(
        DAILY_JOB,
        {},
        { jobId: `fees-daily-startup-${today}`, removeOnComplete: true, removeOnFail: 50 },
      );
    } catch (error) {
      this.logger.error("Couldn't schedule the daily fee run", error);
    }
  }

  async process(job: { name: string }): Promise<void> {
    if (job.name !== DAILY_JOB) {
      this.logger.warn(`Unknown fees job: ${job.name}`);
      return;
    }
    await this.run();
  }

  /** Exposed for tests and one-off runs. */
  async run(now: Date = new Date()): Promise<{ statements: number; reminders: number }> {
    const statements = await this.statements.generateMissing(now);
    const reminders = await this.reminders.sendDue(now);
    // Agents' subscription reminders ride the same daily run.
    await this.agentReminders?.sendDue(now);
    return { statements, reminders };
  }
}
