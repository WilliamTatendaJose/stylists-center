import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { payFeesSchema } from '@sc/shared';
import { readPage } from '../../common/paging';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentProvider } from '../provider/current-provider.decorator';
import { ProviderGuard } from '../provider/provider.guard';
import { FeesService } from './fees.service';

class PayFeesDto extends createZodDto(payFeesSchema) {}

/** A stylist's or vendor's own fees: what they owe, the statements, and paying. */
@Controller('provider/fees')
@UseGuards(JwtAuthGuard, ProviderGuard)
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  summary(@CurrentProvider() providerId: string) {
    return this.fees.summary(providerId);
  }

  @Get('statements')
  statements(@CurrentProvider() providerId: string) {
    return this.fees.listStatements(providerId);
  }

  @Get('entries')
  entries(
    @CurrentProvider() providerId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.fees.listEntries(providerId, readPage(limit, offset));
  }

  @Post('pay')
  pay(@CurrentProvider() providerId: string, @Body() dto: PayFeesDto) {
    return this.fees.pay(providerId, dto);
  }

  @Get('payment-status')
  paymentStatus(@CurrentProvider() providerId: string) {
    return this.fees.paymentStatusFor(providerId);
  }
}
