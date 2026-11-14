import { Global, Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ContentService } from './content.service';
import { AdminSettingsController, PublicConfigController } from './settings.controller';
import { SettingsService } from './settings.service';
import { LegalPagesController } from './legal-pages.controller';

/** Global so any feature can read the business values in effect. */
@Global()
@Module({
  imports: [AdminAuthModule],
  controllers: [PublicConfigController, AdminSettingsController, LegalPagesController],
  providers: [SettingsService, ContentService],
  exports: [SettingsService],
})
export class SettingsModule {}
