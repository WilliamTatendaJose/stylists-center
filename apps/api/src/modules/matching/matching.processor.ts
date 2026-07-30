import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MATCHING_QUEUE } from '../jobs/jobs.module';
import { MatchingService } from './matching.service';

interface ExpireJobData {
  matchId: string;
}
interface OfferTimeoutJobData {
  offerId: string;
}

/** BullMQ worker for the two delayed job types the fan-out schedules (plan §6). */
@Injectable()
@Processor(MATCHING_QUEUE)
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly matching: MatchingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'expire') {
      const { matchId } = job.data as ExpireJobData;
      await this.matching.handleMatchExpiry(matchId);
      return;
    }
    if (job.name === 'offerTimeout') {
      const { offerId } = job.data as OfferTimeoutJobData;
      await this.matching.handleOfferTimeout(offerId);
      return;
    }
    this.logger.warn(`Unknown job name in matching queue: ${job.name}`);
  }
}
