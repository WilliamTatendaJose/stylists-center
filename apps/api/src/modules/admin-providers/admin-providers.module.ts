import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';
import { ImageStorageService } from '../provider/image-storage.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminProvidersController],
  providers: [AdminProvidersService, ImageStorageService],
})
export class AdminProvidersModule {}
