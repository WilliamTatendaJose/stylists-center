import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  ImageStorageService,
  MAX_IMAGE_BYTES,
  type UploadedImageFile,
} from '../provider/image-storage.service';
import { VendorsService } from './vendors.service';
import { ApplyVendorDto, VendorFulfilmentDto } from './dto';

/**
 * Signed-in users only, not ProviderGuard: a shop that is not a stylist has
 * no profile until it applies, so these routes must work before one exists.
 */
@Controller('vendors')
@UseGuards(JwtAuthGuard)
export class VendorsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly images: ImageStorageService,
  ) {}

  /** Premises photos: the stylist upload route needs a stylist page, which an applicant may not have. */
  @Post('images')
  @UseInterceptors(FileInterceptor('image', { limits: { files: 1, fileSize: MAX_IMAGE_BYTES } }))
  uploadImage(@UploadedFile() file: UploadedImageFile | undefined) {
    return this.images.save(file);
  }

  @Get('me')
  me(@CurrentUser() user: { id: string }) {
    return this.vendors.me(user.id);
  }

  @Post('apply')
  apply(@CurrentUser() user: { id: string }, @Body() dto: ApplyVendorDto) {
    return this.vendors.apply(user.id, dto);
  }

  @Patch('me/fulfilment')
  updateFulfilment(@CurrentUser() user: { id: string }, @Body() dto: VendorFulfilmentDto) {
    return this.vendors.updateFulfilment(user.id, dto);
  }
}
