import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  UpdateProviderServiceDto,
  UpdateProviderProductDto,
  RestockProviderProductDto,
} from './dto';
import {
  ImageStorageService,
  MAX_IMAGE_BYTES,
  type UploadedImageFile,
} from './image-storage.service';

/**
 * Everything the stylist side of the app can do. JwtAuthGuard establishes
 * WHO is calling; ProviderGuard establishes that they are a stylist and
 * resolves which one, so no handler can act on another stylist's work.
 */
@Controller('provider')
@UseGuards(JwtAuthGuard, ProviderGuard)
export class ProviderController {
  constructor(
    private readonly provider: ProviderService,
    private readonly images: ImageStorageService,
  ) {}

  @Post('images')
  @UseInterceptors(FileInterceptor('image', { limits: { files: 1, fileSize: MAX_IMAGE_BYTES } }))
  uploadImage(@UploadedFile() file: UploadedImageFile | undefined) {
    return this.images.save(file);
  }

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

  @Patch('services/:id')
  updateService(
    @Param('id') id: string,
    @CurrentProvider() providerId: string,
    @Body() dto: UpdateProviderServiceDto,
  ) {
    return this.provider.updateService(id, providerId, dto);
  }

  @Get('products')
  products(@CurrentProvider() providerId: string) {
    return this.provider.getProducts(providerId);
  }

  @Post('products')
  addProduct(@CurrentProvider() providerId: string, @Body() dto: CreateProviderProductDto) {
    return this.provider.createProduct(providerId, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @Param('id') id: string,
    @CurrentProvider() providerId: string,
    @Body() dto: UpdateProviderProductDto,
  ) {
    return this.provider.updateProduct(id, providerId, dto);
  }

  @Post('products/:id/restock')
  restockProduct(
    @Param('id') id: string,
    @CurrentProvider() providerId: string,
    @Body() dto: RestockProviderProductDto,
  ) {
    return this.provider.restockProduct(id, providerId, dto.quantity);
  }

  /** Soft-delete preserves the immutable item snapshots on earlier orders. */
  @Delete('products/:id')
  deleteProduct(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.deleteProduct(id, providerId);
  }

  @Get('orders')
  orders(@CurrentProvider() providerId: string) {
    return this.provider.getOrders(providerId);
  }

  @Post('orders/:id/ready')
  markOrderReady(@Param('id') id: string, @CurrentProvider() providerId: string) {
    return this.provider.markOrderReady(id, providerId);
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

  @Get('subscription/payment-status')
  subscriptionPaymentStatus(@CurrentProvider() providerId: string) {
    return this.provider.subscriptionPaymentStatus(providerId);
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
