import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProviderGuard } from './provider.guard';
import { CurrentProvider } from './current-provider.decorator';
import { ProviderService } from './provider.service';
import { SetAvailabilityDto } from './dto';

/**
 * Everything the stylist side of the app can do. JwtAuthGuard establishes
 * WHO is calling; ProviderGuard establishes that they are a stylist and
 * resolves which one, so no handler can act on another stylist's work.
 */
@Controller('provider')
@UseGuards(JwtAuthGuard, ProviderGuard)
export class ProviderController {
  constructor(private readonly provider: ProviderService) {}

  @Get('jobs')
  jobs(@CurrentProvider() providerId: string) {
    return this.provider.getJobs(providerId);
  }

  @Post('availability')
  setAvailability(@CurrentProvider() providerId: string, @Body() dto: SetAvailabilityDto) {
    return this.provider.setAvailability(providerId, dto.acceptingBookings);
  }

  @Post('bookings/:id/confirm')
  confirmBooking(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.confirmBooking(id, providerId);
  }

  @Post('bookings/:id/decline')
  declineBooking(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.declineBooking(id, providerId);
  }

  @Post('bookings/:id/confirm-completion')
  confirmCompletion(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.confirmCompletion(id, providerId);
  }

  @Post('offers/:id/accept')
  acceptOffer(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.acceptOffer(id, providerId);
  }

  @Post('offers/:id/decline')
  declineOffer(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.declineOffer(id, providerId);
  }
}
