import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto';

@Controller('admin/users')
@UseGuards(AdminJwtAuthGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  list(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.adminUsers.list({
      query,
      limit: parseInteger(limit, 50),
      offset: parseInteger(offset, 0),
      includeDeleted: includeDeleted === 'true',
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.adminUsers.get(id);
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto) {
    return this.adminUsers.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminUsers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminUsers.remove(id);
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
