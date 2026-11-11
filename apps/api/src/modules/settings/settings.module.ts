import { Global, Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ContentService } from './content.service';
import { AdminSettingsController, PublicConfigController } from './settings.controller';
import { SettingsService } from './settings.service';

/** Global so any feature can read the business values in effect. */
@Global()
@Module({
  imports: [AdminAuthModule],
  controllers: [PublicConfigController, AdminSettingsController],
  providers: [SettingsService, ContentService],
  exports: [SettingsService],
})
export class SettingsModule {}
