import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { CityInputDto, CreateCategoryDto, UpdateCategoryDto } from './dto';
import { AdminRoles } from '../admin-auth/admin-roles';

@Controller('admin/catalog')
@UseGuards(AdminJwtAuthGuard)
export class AdminCatalogController {
  constructor(private readonly adminCatalog: AdminCatalogService) {}

  @Get('categories')
  listCategories() {
    return this.adminCatalog.listCategories();
  }

  @AdminRoles('support')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.adminCatalog.createCategory(dto);
  }

  @AdminRoles('support')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.adminCatalog.updateCategory(id, dto);
  }

  @AdminRoles('support')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.adminCatalog.deleteCategory(id);
  }

  @Get('cities')
  listCities() {
    return this.adminCatalog.listCities();
  }

  @AdminRoles('support')
  @Post('cities')
  createCity(@Body() dto: CityInputDto) {
    return this.adminCatalog.createCity(dto);
  }

  @AdminRoles('support')
  @Patch('cities/:id')
  updateCity(@Param('id') id: string, @Body() dto: CityInputDto) {
    return this.adminCatalog.updateCity(id, dto);
  }

  @AdminRoles('support')
  @Delete('cities/:id')
  deleteCity(@Param('id') id: string) {
    return this.adminCatalog.deleteCity(id);
  }
}
