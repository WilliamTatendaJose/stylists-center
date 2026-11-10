/**
 * Data every environment needs before anyone can use the app: a city to
 * search in and the service categories providers pick from. Ids are fixed and
 * match apps/mobile/src/fixtures/* (see seed.ts), so the demo seed and the
 * production reference seed agree on them.
 */
export const HARARE_CITY_ID = '33333333-3333-4333-8333-333333333333';

export const HARARE_CITY = {
  id: HARARE_CITY_ID,
  name: 'Harare',
  timezone: 'Africa/Harare',
  centroidLat: -17.8252,
  centroidLng: 31.0335,
  bboxWest: 30.9,
  bboxSouth: -18.0,
  bboxEast: 31.2,
  bboxNorth: -17.6,
};

export const CATEGORY_IDS = {
  hairBraiding: '19d5bd66-1556-48de-b31f-2d800ae08fca',
  hairdressing: 'e1725438-a6c8-48b3-b234-af6fb80dd01e',
  barbering: 'e628d57b-b942-44ba-9582-a92708214826',
  nails: 'ae40c0cf-611c-4cfb-8e2b-d1af636f9079',
  makeup: '8a4bccca-69c2-4701-9d4b-92164a5c93c0',
  beautyTreatments: '478b480d-a14b-4eb7-9d87-742f3e80b22e',
  other: '5855db43-08ee-4843-9f90-09238bfd12e8',
} as const;

export const CATEGORIES = [
  { id: CATEGORY_IDS.hairBraiding, name: 'Hair Braiding' },
  { id: CATEGORY_IDS.hairdressing, name: 'Hairdressing' },
  { id: CATEGORY_IDS.barbering, name: 'Barbering' },
  { id: CATEGORY_IDS.nails, name: 'Nails' },
  { id: CATEGORY_IDS.makeup, name: 'Makeup' },
  { id: CATEGORY_IDS.beautyTreatments, name: 'Beauty Treatments' },
  { id: CATEGORY_IDS.other, name: 'Other' },
];
