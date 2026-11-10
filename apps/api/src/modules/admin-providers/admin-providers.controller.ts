import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminProvidersService } from './admin-providers.service';
import { UpdateProviderAdminDto } from './dto';
import { AdminRoles } from '../admin-auth/admin-roles';
import { readPage, searchTerm } from '../../common/paging';

function parseBoolean(value?: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

@Controller('admin/providers')
@UseGuards(AdminJwtAuthGuard)
export class AdminProvidersController {
  constructor(private readonly adminProviders: AdminProvidersService) {}

  @Get()
  list(
    @Query('verified') verified?: string,
    @Query('subscription') subscription?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminProviders.list({
      verified: parseBoolean(verified),
      subscription:
        subscription === 'active' || subscription === 'lapsed' ? subscription : undefined,
      q: searchTerm(q),
      page: readPage(limit, offset),
    });
  }

  @Get('subscription-summary')
  subscriptionSummary() {
    return this.adminProviders.subscriptionSummary();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.adminProviders.get(id);
  }

  @AdminRoles('support')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProviderAdminDto) {
    return this.adminProviders.update(id, dto);
  }

  @AdminRoles('finance')
  @Post(':id/subscription/extend')
  extendSubscription(@Param('id') id: string) {
    return this.adminProviders.extendSubscription(id);
  }
}
