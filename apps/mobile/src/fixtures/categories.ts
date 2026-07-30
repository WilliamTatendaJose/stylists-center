import type { CategoryDto } from '@sc/shared';

/**
 * Mock categories mirroring the handoff's Home screen exactly (Hair Braiding
 * 12 · Hairdressing 9 · Barbering 17 · Nails 8 · Makeup 6 · Beauty Treatments
 * 4 · Other 3). IDs are fixed so provider fixtures can reference them
 * directly. This file's shape mirrors the eventual seed script
 * (apps/api/prisma/seed.ts, Phase 3) so the mock-to-API cutover changes only
 * the data source, not the shape screens consume.
 */
export const CATEGORY_IDS = {
  hairBraiding: '19d5bd66-1556-48de-b31f-2d800ae08fca',
  hairdressing: 'e1725438-a6c8-48b3-b234-af6fb80dd01e',
  barbering: 'e628d57b-b942-44ba-9582-a92708214826',
  nails: 'ae40c0cf-611c-4cfb-8e2b-d1af636f9079',
  makeup: '8a4bccca-69c2-4701-9d4b-92164a5c93c0',
  beautyTreatments: '478b480d-a14b-4eb7-9d87-742f3e80b22e',
  other: '5855db43-08ee-4843-9f90-09238bfd12e8',
} as const;

export const CATEGORIES: CategoryDto[] = [
  { id: CATEGORY_IDS.hairBraiding, name: 'Hair Braiding', nearbyCount: 12 },
  { id: CATEGORY_IDS.hairdressing, name: 'Hairdressing', nearbyCount: 9 },
  { id: CATEGORY_IDS.barbering, name: 'Barbering', nearbyCount: 17 },
  { id: CATEGORY_IDS.nails, name: 'Nails', nearbyCount: 8 },
  { id: CATEGORY_IDS.makeup, name: 'Makeup', nearbyCount: 6 },
  { id: CATEGORY_IDS.beautyTreatments, name: 'Beauty Treatments', nearbyCount: 4 },
  { id: CATEGORY_IDS.other, name: 'Other', nearbyCount: 3 },
];
