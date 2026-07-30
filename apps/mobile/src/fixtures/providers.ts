import type { ProviderListRowDto, ProviderProfileDto, ProviderSlotsResponse } from '@sc/shared';
import { CATEGORY_IDS } from './categories.js';

/**
 * Seed coordinates and distances are the exact ones from the design handoff
 * (client at Avondale -17.7955,31.0330), so the Phase 2 map screens will line
 * up pixel-for-pixel with the reference once wired to these same fixtures.
 * distanceKm below is the real haversine distance from the client point —
 * Rudo (Borrowdale) really is ~8.5 km out, matching the handoff's "Borrowdale
 * is ~9 km out" note.
 */
export const PROVIDER_IDS = {
  tariro: 'e628d57b-b942-44ba-9582-a92708214826',
  chiedza: 'ae40c0cf-611c-4cfb-8e2b-d1af636f9079',
  kudzai: '8a4bccca-69c2-4701-9d4b-92164a5c93c0',
  nyasha: '478b480d-a14b-4eb7-9d87-742f3e80b22e',
  rudo: '5855db43-08ee-4843-9f90-09238bfd12e8',
} as const;

export const PROVIDER_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  [PROVIDER_IDS.tariro]: { lat: -17.793, lng: 31.0345 },
  [PROVIDER_IDS.chiedza]: { lat: -17.812, lng: 31.025 },
  [PROVIDER_IDS.kudzai]: { lat: -17.808, lng: 31.039 },
  [PROVIDER_IDS.nyasha]: { lat: -17.769, lng: 31.049 },
  [PROVIDER_IDS.rudo]: { lat: -17.742, lng: 31.09 },
};

export const PROVIDER_LIST: ProviderListRowDto[] = [
  {
    id: PROVIDER_IDS.tariro,
    displayName: 'Tariro',
    tint: '#201e1d',
    initials: 'TM',
    verified: true,
    categoryName: 'Hair Braiding',
    areaName: 'Avondale',
    ratingAvg: 4.9,
    completedCount: 212,
    fromPriceUsdCents: 1000,
    distanceKm: 0.3,
  },
  {
    id: PROVIDER_IDS.chiedza,
    displayName: 'Chiedza',
    tint: '#ec3013',
    initials: 'CB',
    verified: true,
    categoryName: 'Hairdressing',
    areaName: 'Milton Park',
    ratingAvg: 4.7,
    completedCount: 143,
    fromPriceUsdCents: 1800,
    distanceKm: 2.0,
  },
  {
    id: PROVIDER_IDS.kudzai,
    displayName: 'Kudzai',
    tint: '#605d5d',
    initials: 'KK',
    verified: true,
    categoryName: 'Nails',
    areaName: 'Belgravia',
    ratingAvg: 4.8,
    completedCount: 301,
    fromPriceUsdCents: 1200,
    distanceKm: 1.5,
  },
  {
    id: PROVIDER_IDS.nyasha,
    displayName: 'Nyasha',
    tint: '#9b9797',
    initials: 'NB',
    verified: false,
    categoryName: 'Makeup',
    areaName: 'Mount Pleasant',
    ratingAvg: 4.6,
    completedCount: 88,
    fromPriceUsdCents: 3000,
    distanceKm: 3.4,
  },
  {
    id: PROVIDER_IDS.rudo,
    displayName: 'Rudo',
    tint: '#7c1405',
    initials: 'RM',
    verified: true,
    categoryName: 'Barbering',
    areaName: 'Borrowdale',
    ratingAvg: 4.9,
    completedCount: 410,
    fromPriceUsdCents: 1000,
    distanceKm: 8.5,
  },
];

/** Full profile detail, keyed by provider id — used by /provider/[id]. */
export const PROVIDER_PROFILES: Record<string, ProviderProfileDto> = {
  [PROVIDER_IDS.tariro]: {
    id: PROVIDER_IDS.tariro,
    displayName: 'Tariro',
    tint: '#201e1d',
    initials: 'TM',
    verified: true,
    categoryName: 'Hair Braiding',
    areaName: 'Avondale',
    distanceKm: 0.3,
    ratingAvg: 4.9,
    completedCount: 212,
    yearsExperience: 6,
    portfolioImageUrls: [],
    priceDisplay: 'list',
    services: [
      { id: 'svc-cornrows', name: 'Cornrows', durationMinutes: 90, priceUsdCents: 1800 },
      { id: 'svc-knotless', name: 'Knotless medium', durationMinutes: 240, priceUsdCents: 3000 },
      {
        id: 'svc-takedown',
        name: 'Take-down & wash',
        durationMinutes: 60,
        priceUsdCents: 1000,
      },
    ],
    reviews: [
      {
        id: 'rev-1',
        authorName: 'Rutendo M.',
        rating: 5,
        text: 'Gentle hands and my cornrows lasted three weeks.',
      },
      {
        id: 'rev-2',
        authorName: 'Anesu K.',
        rating: 5,
        text: 'Home visit was on time and she cleaned up after.',
      },
    ],
    workingHoursLabel: 'Mon–Sat, 08:00–18:00. Home visits within 5 km.',
  },
  [PROVIDER_IDS.chiedza]: {
    id: PROVIDER_IDS.chiedza,
    displayName: 'Chiedza',
    tint: '#ec3013',
    initials: 'CB',
    verified: true,
    categoryName: 'Hairdressing',
    areaName: 'Milton Park',
    distanceKm: 2.0,
    ratingAvg: 4.7,
    completedCount: 143,
    yearsExperience: 4,
    portfolioImageUrls: [],
    priceDisplay: 'list',
    services: [
      { id: 'svc-wash-set', name: 'Wash & set', durationMinutes: 60, priceUsdCents: 1800 },
      { id: 'svc-relaxer', name: 'Relaxer touch-up', durationMinutes: 120, priceUsdCents: 2500 },
    ],
    reviews: [
      {
        id: 'rev-1',
        authorName: 'Grace T.',
        rating: 4,
        text: 'Good work, salon gets busy on Saturdays.',
      },
    ],
    workingHoursLabel: 'Tue–Sun, 09:00–19:00.',
  },
  [PROVIDER_IDS.kudzai]: {
    id: PROVIDER_IDS.kudzai,
    displayName: 'Kudzai',
    tint: '#605d5d',
    initials: 'KK',
    verified: true,
    categoryName: 'Nails',
    areaName: 'Belgravia',
    distanceKm: 1.5,
    ratingAvg: 4.8,
    completedCount: 301,
    yearsExperience: 5,
    portfolioImageUrls: [],
    priceDisplay: 'from',
    fromPriceUsdCents: 1200,
    services: [
      { id: 'svc-gel', name: 'Gel overlay', durationMinutes: 45, priceUsdCents: 1200 },
      { id: 'svc-acrylic', name: 'Full set acrylic', durationMinutes: 90, priceUsdCents: 2200 },
    ],
    reviews: [
      { id: 'rev-1', authorName: 'Nokutenda S.', rating: 5, text: 'Best nail tech in Belgravia.' },
    ],
    workingHoursLabel: 'Mon–Sat, 08:30–17:30.',
  },
  [PROVIDER_IDS.nyasha]: {
    id: PROVIDER_IDS.nyasha,
    displayName: 'Nyasha',
    tint: '#9b9797',
    initials: 'NB',
    verified: false,
    categoryName: 'Makeup',
    areaName: 'Mount Pleasant',
    distanceKm: 3.4,
    ratingAvg: 4.6,
    completedCount: 88,
    yearsExperience: 3,
    portfolioImageUrls: [],
    priceDisplay: 'from',
    fromPriceUsdCents: 3000,
    services: [
      { id: 'svc-bridal', name: 'Bridal makeup', durationMinutes: 90, priceUsdCents: 5000 },
      { id: 'svc-event', name: 'Event makeup', durationMinutes: 60, priceUsdCents: 3000 },
    ],
    reviews: [
      {
        id: 'rev-1',
        authorName: 'Fadzai N.',
        rating: 4,
        text: 'Lovely, natural look for my sister’s wedding.',
      },
    ],
    workingHoursLabel: 'By appointment, 7 days.',
  },
  [PROVIDER_IDS.rudo]: {
    id: PROVIDER_IDS.rudo,
    displayName: 'Rudo',
    tint: '#7c1405',
    initials: 'RM',
    verified: true,
    categoryName: 'Barbering',
    areaName: 'Borrowdale',
    distanceKm: 8.5,
    ratingAvg: 4.9,
    completedCount: 410,
    yearsExperience: 8,
    portfolioImageUrls: [],
    priceDisplay: 'list',
    services: [
      { id: 'svc-fade', name: 'Skin fade', durationMinutes: 30, priceUsdCents: 1000 },
      { id: 'svc-lineup', name: 'Line-up', durationMinutes: 15, priceUsdCents: 500 },
    ],
    reviews: [
      {
        id: 'rev-1',
        authorName: 'Tapiwa C.',
        rating: 5,
        text: 'Sharpest fade in Borrowdale, every time.',
      },
    ],
    workingHoursLabel: 'Mon–Sat, 09:00–19:00.',
  },
};

const TARIRO_TIMES = ['08:00', '09:30', '10:00', '11:30', '13:00', '14:30'];
const TARIRO_TAKEN = new Set(['09:30', '13:00']);

/** Slot availability, keyed by provider id — every provider shares the handoff's exact time grid for M1. */
export function getSlotsForProvider(_providerId: string, date: string): ProviderSlotsResponse {
  return {
    date,
    slots: TARIRO_TIMES.map((time) => ({ time, available: !TARIRO_TAKEN.has(time) })),
  };
}

/** Ties a provider back to its category id, for the Home "Available now" -> category cross-reference. */
export const PROVIDER_CATEGORY: Record<string, string> = {
  [PROVIDER_IDS.tariro]: CATEGORY_IDS.hairBraiding,
  [PROVIDER_IDS.chiedza]: CATEGORY_IDS.hairdressing,
  [PROVIDER_IDS.kudzai]: CATEGORY_IDS.nails,
  [PROVIDER_IDS.nyasha]: CATEGORY_IDS.makeup,
  [PROVIDER_IDS.rudo]: CATEGORY_IDS.barbering,
};
