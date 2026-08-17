import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';

/**
 * Global for the same reason the realtime emitter is reachable everywhere:
 * notifying is a cross-cutting side effect of actions that live in bookings,
 * chat and matching, and threading a module import through each of them buys
 * nothing.
 */
@Global()
@Module({
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}
