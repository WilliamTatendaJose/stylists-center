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
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { AdminStaffService } from './admin-staff.service';
import { CreateStaffDto, UpdateStaffDto } from './dto';

@Controller('admin/staff')
@UseGuards(AdminJwtAuthGuard)
export class AdminStaffController {
  constructor(private readonly adminStaff: AdminStaffService) {}

  @Get()
  list(@Query('includeDeleted') includeDeleted?: string) {
    return this.adminStaff.list(includeDeleted === 'true');
  }

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.adminStaff.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentAdmin() admin: { id: string },
  ) {
    return this.adminStaff.update(id, dto, admin.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentAdmin() admin: { id: string }) {
    return this.adminStaff.remove(id, admin.id);
  }
}
