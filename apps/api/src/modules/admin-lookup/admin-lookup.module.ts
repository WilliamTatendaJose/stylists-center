import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminLookupController } from './admin-lookup.controller';
import { AdminLookupService } from './admin-lookup.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminLookupController],
  providers: [AdminLookupService],
})
export class AdminLookupModule {}
