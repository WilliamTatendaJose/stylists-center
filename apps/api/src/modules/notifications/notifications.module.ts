import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { JobsModule } from '../jobs/jobs.module';
import { ReminderService } from './reminder.service';
import { ReminderProcessor } from './reminder.processor';

/**
 * Global for the same reason the realtime emitter is reachable everywhere:
 * notifying is a cross-cutting side effect of actions that live in bookings,
 * chat and matching, and threading a module import through each of them buys
 * nothing.
 */
@Global()
@Module({
  imports: [JobsModule],
  providers: [PushService, ReminderService, ReminderProcessor],
  exports: [PushService, ReminderService],
})
export class NotificationsModule {}
