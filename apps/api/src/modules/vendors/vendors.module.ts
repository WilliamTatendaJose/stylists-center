import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImageStorageService } from '../provider/image-storage.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule],
  controllers: [VendorsController],
  providers: [VendorsService, ImageStorageService],
  exports: [VendorsService],
})
export class VendorsModule {}
