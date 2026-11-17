import { Body, Controller, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { storePurchaseSchema } from '@sc/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StoreBillingService } from './store-billing.service';

class StorePurchaseDto extends createZodDto(storePurchaseSchema) {}

@Controller()
export class StoreBillingController {
  constructor(private readonly billing: StoreBillingService) {}

  /** The app bought or restored the agent subscription in Google Play / the App Store. */
  @Post('wallet/agent-subscription/store-purchase')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  storePurchase(@CurrentUser() user: { id: string }, @Body() dto: StorePurchaseDto) {
    return this.billing.verifyPurchase(user.id, dto);
  }

  /** Google Play real-time developer notifications (Pub/Sub push, `?token=` shared secret). */
  @Post('store/google/notifications')
  @HttpCode(204)
  async google(@Query('token') token: string | undefined, @Body() body: unknown): Promise<void> {
    await this.billing.handleGoogleNotification(token, body);
  }

  /** App Store Server Notifications, version 2. */
  @Post('store/apple/notifications')
  @HttpCode(204)
  async apple(@Body() body: unknown): Promise<void> {
    await this.billing.handleAppleNotification(body);
  }
}
