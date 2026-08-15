import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminProvidersController],
  providers: [AdminProvidersService],
})
export class AdminProvidersModule {}
