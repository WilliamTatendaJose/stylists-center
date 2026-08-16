import { ConflictException, Injectable } from '@nestjs/common';
import type {
  AdminCategoryRowDto,
  AdminCityRowDto,
  CityInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@sc/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const CATEGORY_INCLUDE = {
  parent: { select: { name: true } },
  _count: { select: { providers: true } },
} satisfies Prisma.CategoryInclude;

type CategoryWithRelations = Prisma.CategoryGetPayload<{ include: typeof CATEGORY_INCLUDE }>;

const CITY_INCLUDE = {
  _count: { select: { users: true, providers: true } },
} satisfies Prisma.CityInclude;

type CityWithRelations = Prisma.CityGetPayload<{ include: typeof CITY_INCLUDE }>;

/**
 * Category and City are both seed-only today — every row that exists came
 * from prisma/seed.ts, with no write path anywhere else. Growth into a new
 * city or service category has meant a deploy until now.
 */
@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<AdminCategoryRowDto[]> {
    const categories = await this.prisma.category.findMany({
      include: CATEGORY_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return categories.map(toCategoryRow);
  }

  async createCategory(input: CreateCategoryInput): Promise<AdminCategoryRowDto> {
    const category = await this.prisma.category.create({
      data: { name: input.name, parentId: input.parentId ?? null },
      include: CATEGORY_INCLUDE,
    });
    return toCategoryRow(category);
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<AdminCategoryRowDto> {
    const category = await this.prisma.category.update({
      where: { id },
      data: { name: input.name },
      include: CATEGORY_INCLUDE,
    });
    return toCategoryRow(category);
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (err) {
      throw toDeleteError(err, 'This category is still in use by providers or a sub-category');
    }
  }

  async listCities(): Promise<AdminCityRowDto[]> {
    const cities = await this.prisma.city.findMany({
      include: CITY_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return cities.map(toCityRow);
  }

  async createCity(input: CityInput): Promise<AdminCityRowDto> {
    const city = await this.prisma.city.create({ data: input, include: CITY_INCLUDE });
    return toCityRow(city);
  }

  async updateCity(id: string, input: CityInput): Promise<AdminCityRowDto> {
    const city = await this.prisma.city.update({
      where: { id },
      data: input,
      include: CITY_INCLUDE,
    });
    return toCityRow(city);
  }

  async deleteCity(id: string): Promise<void> {
    try {
      await this.prisma.city.delete({ where: { id } });
    } catch (err) {
      throw toDeleteError(err, 'This city still has users or providers in it');
    }
  }
}

function toDeleteError(err: unknown, message: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2003' || err.code === 'P2014')
  ) {
    return new ConflictException(message);
  }
  return err;
}

function toCategoryRow(category: CategoryWithRelations): AdminCategoryRowDto {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    parentName: category.parent?.name ?? null,
    providerCount: category._count.providers,
  };
}

function toCityRow(city: CityWithRelations): AdminCityRowDto {
  return {
    id: city.id,
    name: city.name,
    timezone: city.timezone,
    centroidLat: city.centroidLat,
    centroidLng: city.centroidLng,
    bboxWest: city.bboxWest,
    bboxSouth: city.bboxSouth,
    bboxEast: city.bboxEast,
    bboxNorth: city.bboxNorth,
    userCount: city._count.users,
    providerCount: city._count.providers,
  };
}
