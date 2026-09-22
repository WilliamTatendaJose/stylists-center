import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { REMINDERS_QUEUE } from '../jobs/jobs.module';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  constructor(@InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue) {}

  async scheduleBooking(bookingId: string, startsAt: Date): Promise<void> {
    for (const hoursBefore of [24, 2]) {
      const delay = startsAt.getTime() - Date.now() - hoursBefore * 60 * 60_000;
      if (delay <= 0) continue;
      try {
        await this.queue.add(
          'booking',
          { bookingId, startsAt: startsAt.toISOString(), hoursBefore },
          {
            jobId: `booking-${bookingId}-${String(startsAt.getTime())}-${String(hoursBefore)}`,
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
          },
        );
      } catch (error) {
        this.logger.error(`Couldn't schedule booking reminder ${bookingId}`, error);
      }
    }
  }

  async schedulePickup(orderId: string, readyAt: Date): Promise<void> {
    try {
      await this.queue.add(
        'pickup',
        { orderId, readyAt: readyAt.toISOString() },
        {
          jobId: `pickup-${orderId}`,
          delay: 24 * 60 * 60_000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
        },
      );
    } catch (error) {
      this.logger.error(`Couldn't schedule pickup reminder ${orderId}`, error);
    }
  }
}
