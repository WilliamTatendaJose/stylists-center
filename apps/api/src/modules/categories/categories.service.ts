import { Injectable } from '@nestjs/common';
import type { CategoryDto } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeoRepository } from '../geo/geo.repository';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
  ) {}

  /**
   * `nearbyCount` always comes from a live PostGIS query, never a stored or
   * placeholder number (@sc/shared/domain/radius.ts is explicit that the
   * handoff's "4 / 9 / 16" figures are design placeholder copy, not a
   * business rule) — this is that live query.
   */
  async list(lat: number, lng: number, radiusKm: number): Promise<CategoryDto[]> {
    const [categories, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.geo.countProvidersByCategory(lat, lng, radiusKm),
    ]);

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      nearbyCount: counts.get(c.id) ?? 0,
    }));
  }
}
