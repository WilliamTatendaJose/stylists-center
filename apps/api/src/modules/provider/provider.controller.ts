import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProviderGuard } from './provider.guard';
import { CurrentProvider } from './current-provider.decorator';
import { ProviderService } from './provider.service';
import {
  CreateProviderProductDto,
  CreateProviderServiceDto,
  PaySubscriptionDto,
  SetAvailabilityDto,
  UpdateProviderProfileDto,
} from './dto';

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

  @Get('earnings')
  earnings(@CurrentProvider() providerId: string) {
    return this.provider.getEarnings(providerId);
  }

  @Get('profile')
  profile(@CurrentProvider() providerId: string) {
    return this.provider.getProfile(providerId);
  }

  @Patch('profile')
  updateProfile(@CurrentProvider() providerId: string, @Body() dto: UpdateProviderProfileDto) {
    return this.provider.updateProfile(providerId, dto);
  }

  @Post('services')
  addService(@CurrentProvider() providerId: string, @Body() dto: CreateProviderServiceDto) {
    return this.provider.addService(providerId, dto);
  }

  @Get('products')
  products(@CurrentProvider() providerId: string) {
    return this.provider.getProducts(providerId);
  }

  @Post('products')
  addProduct(@CurrentProvider() providerId: string, @Body() dto: CreateProviderProductDto) {
    return this.provider.createProduct(providerId, dto);
  }

  @Get('orders')
  orders(@CurrentProvider() providerId: string) {
    return this.provider.getOrders(providerId);
  }

  @Post('orders/:id/collect')
  collectOrder(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.collectOrder(id, providerId);
  }

  @Post('availability')
  setAvailability(@CurrentProvider() providerId: string, @Body() dto: SetAvailabilityDto) {
    return this.provider.setAvailability(providerId, dto.acceptingBookings);
  }

  @Get('subscription')
  subscription(@CurrentProvider() providerId: string) {
    return this.provider.getSubscription(providerId);
  }

  @Post('subscription/pay')
  paySubscription(@CurrentProvider() providerId: string, @Body() dto: PaySubscriptionDto) {
    return this.provider.paySubscription(providerId, dto);
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
