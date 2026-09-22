import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { REMINDERS_QUEUE } from '../jobs/jobs.module';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

@Injectable()
@Processor(REMINDERS_QUEUE)
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'booking') {
      const data = job.data as { bookingId: string; startsAt: string; hoursBefore: number };
      const booking = await this.prisma.booking.findUnique({
        where: { id: data.bookingId },
        include: {
          client: { select: { bookingRemindersEnabled: true } },
          provider: {
            select: {
              userId: true,
              displayName: true,
              user: { select: { bookingRemindersEnabled: true } },
            },
          },
        },
      });
      if (
        !booking ||
        booking.status !== 'confirmed' ||
        booking.startsAt.toISOString() !== data.startsAt ||
        booking.startsAt <= new Date()
      )
        return;
      const when = data.hoursBefore === 24 ? 'tomorrow' : 'in about two hours';
      if (booking.client.bookingRemindersEnabled) {
        await this.push.sendToUser(booking.clientId, {
          title: 'Appointment reminder',
          body: `Your appointment with ${booking.provider.displayName} is ${when}.`,
          data: { type: 'booking.updated', bookingId: booking.id },
        });
      }
      if (booking.provider.user.bookingRemindersEnabled) {
        await this.push.sendToUser(booking.provider.userId, {
          title: 'Appointment reminder',
          body: `You have an appointment ${when}.`,
          data: { type: 'booking.updated', bookingId: booking.id },
        });
      }
      return;
    }
    if (job.name === 'pickup') {
      const data = job.data as { orderId: string; readyAt: string };
      const order = await this.prisma.order.findUnique({
        where: { id: data.orderId },
        include: { buyer: { select: { pickupRemindersEnabled: true } } },
      });
      if (!order || order.status !== 'ready_for_collection' || !order.buyer.pickupRemindersEnabled)
        return;
      await this.push.sendToUser(order.buyerId, {
        title: 'Order waiting for pickup',
        body: `Order ${order.reference} is ready for collection.`,
        data: { type: 'market.order.ready', orderId: order.id },
      });
      return;
    }
    this.logger.warn(`Unknown reminder job: ${job.name}`);
  }
}
