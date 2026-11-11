import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { AppConfigDto, ContentDocumentDto } from '@sc/shared';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminRoles, OwnerOnly } from '../admin-auth/admin-roles';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { ContentService } from './content.service';
import { UpdateContentDocumentDto, UpdateSettingDto } from './dto';
import { SettingsService } from './settings.service';

/** Public: what the apps read. No sign-in needed, so the screens work before login too. */
@Controller()
export class PublicConfigController {
  constructor(
    private readonly settings: SettingsService,
    private readonly content: ContentService,
  ) {}

  @Get('config')
  async config(): Promise<AppConfigDto> {
    const s = await this.settings.all();
    return {
      coinUsdCents: s.coinUsdCents,
      referralRewardCoins: s.referralRewardCoins,
      cashOutMinUsdCents: s.cashOutMinUsdCents,
      subscriptionPriceUsdCents: s.subscriptionPriceUsdCents,
      subscriptionCycleDays: s.subscriptionCycleDays,
      budgetMinUsd: s.budgetMinUsd,
      budgetMaxUsd: s.budgetMaxUsd,
      budgetStepUsd: s.budgetStepUsd,
      supportPhone: s.supportPhone,
      supportWhatsapp: s.supportWhatsapp,
      supportEmail: s.supportEmail,
      supportHours: s.supportHours,
    };
  }

  @Get('content/:key')
  document(@Param('key') key: string): Promise<ContentDocumentDto> {
    return this.content.get(key);
  }
}

/**
 * Console: business values and legal text. Any staff member can read them;
 * only owners can change them, because a wrong price or
 * reward affects every user at once.
 */
@Controller('admin')
@UseGuards(AdminJwtAuthGuard)
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly content: ContentService,
  ) {}

  @AdminRoles('finance', 'support')
  @Get('settings')
  list() {
    return this.settings.list();
  }

  @OwnerOnly()
  @Put('settings/:key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentAdmin() admin: { id: string },
  ) {
    return this.settings.set(key, dto.value, admin.id);
  }

  @AdminRoles('finance', 'support')
  @Get('content')
  listContent() {
    return this.content.list();
  }

  @OwnerOnly()
  @Put('content/:key')
  saveContent(
    @Param('key') key: string,
    @Body() dto: UpdateContentDocumentDto,
    @CurrentAdmin() admin: { id: string },
  ) {
    return this.content.save(key, dto, admin.id);
  }
}
