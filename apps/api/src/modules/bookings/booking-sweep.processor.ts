import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { BOOKINGS_QUEUE } from '../jobs/jobs.module';
import { BookingLifecycleService } from './booking-lifecycle.service';

const SWEEP_EVERY_MS = 5 * 60_000;

/**
 * Completes bookings only one side confirmed once the window has passed.
 *
 * A repeating sweep rather than one delayed job per confirmation: the
 * window is a setting that can change after a confirmation, a sweep needs no
 * per-booking bookkeeping to keep in step with reschedules, and running it
 * twice is harmless (`autoCompleteDue` re-checks each booking under its lock).
 */
@Injectable()
@Processor(BOOKINGS_QUEUE)
export class BookingSweepProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookingSweepProcessor.name);

  constructor(
    private readonly lifecycle: BookingLifecycleService,
    @InjectQueue(BOOKINGS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      // Upsert, so every instance and every restart registers the same schedule.
      await this.queue.upsertJobScheduler(
        'auto-complete',
        { every: SWEEP_EVERY_MS },
        { name: 'auto-complete', opts: { removeOnComplete: true, removeOnFail: 100 } },
      );
    } catch (error) {
      this.logger.error("Couldn't schedule the booking auto-complete sweep", error);
    }
  }

  async process(): Promise<void> {
    const completed = await this.lifecycle.autoCompleteDue();
    if (completed > 0) this.logger.log(`Auto-completed ${String(completed)} booking(s)`);
  }
}
