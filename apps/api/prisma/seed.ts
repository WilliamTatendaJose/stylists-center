import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { formatBookingReference } from '@sc/shared';
import { PrismaClient } from '../src/generated/prisma/index.js';

/**
 * Every id below is fixed rather than @default(uuid())'d, and matches
 * apps/mobile/src/fixtures/* exactly (plan §7) — that's what makes the
 * mock-to-API cutover in later Phase 3 steps a queryFn swap instead of a
 * rewrite: the same provider/category ids the mobile fixtures already
 * reference resolve to real rows once a screen points at the real endpoint.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const HARARE_CITY_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_USER_ID = '11111111-1111-4111-8111-111111111111';

const CATEGORY_IDS = {
  hairBraiding: '19d5bd66-1556-48de-b31f-2d800ae08fca',
  hairdressing: 'e1725438-a6c8-48b3-b234-af6fb80dd01e',
  barbering: 'e628d57b-b942-44ba-9582-a92708214826',
  nails: 'ae40c0cf-611c-4cfb-8e2b-d1af636f9079',
  makeup: '8a4bccca-69c2-4701-9d4b-92164a5c93c0',
  beautyTreatments: '478b480d-a14b-4eb7-9d87-742f3e80b22e',
  other: '5855db43-08ee-4843-9f90-09238bfd12e8',
} as const;

const CATEGORIES = [
  { id: CATEGORY_IDS.hairBraiding, name: 'Hair Braiding' },
  { id: CATEGORY_IDS.hairdressing, name: 'Hairdressing' },
  { id: CATEGORY_IDS.barbering, name: 'Barbering' },
  { id: CATEGORY_IDS.nails, name: 'Nails' },
  { id: CATEGORY_IDS.makeup, name: 'Makeup' },
  { id: CATEGORY_IDS.beautyTreatments, name: 'Beauty Treatments' },
  { id: CATEGORY_IDS.other, name: 'Other' },
];

const PROVIDER_IDS = {
  tariro: 'e628d57b-b942-44ba-9582-a92708214826',
  chiedza: 'ae40c0cf-611c-4cfb-8e2b-d1af636f9079',
  kudzai: '8a4bccca-69c2-4701-9d4b-92164a5c93c0',
  nyasha: '478b480d-a14b-4eb7-9d87-742f3e80b22e',
  rudo: '5855db43-08ee-4843-9f90-09238bfd12e8',
} as const;

const PROVIDER_USER_IDS = {
  tariro: '22222222-2222-4222-8222-222222222221',
  chiedza: '22222222-2222-4222-8222-222222222222',
  kudzai: '22222222-2222-4222-8222-222222222223',
  nyasha: '22222222-2222-4222-8222-222222222224',
  rudo: '22222222-2222-4222-8222-222222222225',
} as const;

interface ProviderSeed {
  id: string;
  userId: string;
  phone: string;
  displayName: string;
  tint: string;
  initials: string;
  categoryId: string;
  areaName: string;
  latitude: number;
  longitude: number;
  yearsExperience: number;
  priceDisplay: 'list' | 'from';
  fromPriceUsdCents?: number;
  workingHoursLabel: string;
  verified: boolean;
  ratingAvg: number;
  completedCount: number;
  services: { name: string; durationMinutes: number; priceUsdCents: number }[];
}

const PROVIDERS: ProviderSeed[] = [
  {
    id: PROVIDER_IDS.tariro,
    userId: PROVIDER_USER_IDS.tariro,
    phone: '+263772000001',
    displayName: 'Tariro',
    tint: '#201e1d',
    initials: 'TM',
    categoryId: CATEGORY_IDS.hairBraiding,
    areaName: 'Avondale',
    latitude: -17.793,
    longitude: 31.0345,
    yearsExperience: 6,
    priceDisplay: 'list',
    workingHoursLabel: 'Mon–Sat, 08:00–18:00. Home visits within 5 km.',
    verified: true,
    ratingAvg: 4.9,
    completedCount: 212,
    services: [
      { name: 'Cornrows', durationMinutes: 90, priceUsdCents: 1800 },
      { name: 'Knotless medium', durationMinutes: 240, priceUsdCents: 3000 },
      { name: 'Take-down & wash', durationMinutes: 60, priceUsdCents: 1000 },
    ],
  },
  {
    id: PROVIDER_IDS.chiedza,
    userId: PROVIDER_USER_IDS.chiedza,
    phone: '+263772000002',
    displayName: 'Chiedza',
    tint: '#ec3013',
    initials: 'CB',
    categoryId: CATEGORY_IDS.hairdressing,
    areaName: 'Milton Park',
    latitude: -17.812,
    longitude: 31.025,
    yearsExperience: 4,
    priceDisplay: 'list',
    workingHoursLabel: 'Tue–Sun, 09:00–19:00.',
    verified: true,
    ratingAvg: 4.7,
    completedCount: 143,
    services: [
      { name: 'Wash & set', durationMinutes: 60, priceUsdCents: 1800 },
      { name: 'Relaxer touch-up', durationMinutes: 120, priceUsdCents: 2500 },
    ],
  },
  {
    id: PROVIDER_IDS.kudzai,
    userId: PROVIDER_USER_IDS.kudzai,
    phone: '+263772000003',
    displayName: 'Kudzai',
    tint: '#605d5d',
    initials: 'KK',
    categoryId: CATEGORY_IDS.nails,
    areaName: 'Belgravia',
    latitude: -17.808,
    longitude: 31.039,
    yearsExperience: 5,
    priceDisplay: 'from',
    fromPriceUsdCents: 1200,
    workingHoursLabel: 'Mon–Sat, 08:30–17:30.',
    verified: true,
    ratingAvg: 4.8,
    completedCount: 301,
    services: [
      { name: 'Gel overlay', durationMinutes: 45, priceUsdCents: 1200 },
      { name: 'Full set acrylic', durationMinutes: 90, priceUsdCents: 2200 },
    ],
  },
  {
    id: PROVIDER_IDS.nyasha,
    userId: PROVIDER_USER_IDS.nyasha,
    phone: '+263772000004',
    displayName: 'Nyasha',
    tint: '#9b9797',
    initials: 'NB',
    categoryId: CATEGORY_IDS.makeup,
    areaName: 'Mount Pleasant',
    latitude: -17.769,
    longitude: 31.049,
    yearsExperience: 3,
    priceDisplay: 'from',
    fromPriceUsdCents: 3000,
    workingHoursLabel: 'By appointment, 7 days.',
    verified: false,
    ratingAvg: 4.6,
    completedCount: 88,
    services: [
      { name: 'Bridal makeup', durationMinutes: 90, priceUsdCents: 5000 },
      { name: 'Event makeup', durationMinutes: 60, priceUsdCents: 3000 },
    ],
  },
  {
    id: PROVIDER_IDS.rudo,
    userId: PROVIDER_USER_IDS.rudo,
    phone: '+263772000005',
    displayName: 'Rudo',
    tint: '#7c1405',
    initials: 'RM',
    categoryId: CATEGORY_IDS.barbering,
    areaName: 'Borrowdale',
    latitude: -17.742,
    longitude: 31.09,
    yearsExperience: 8,
    priceDisplay: 'list',
    workingHoursLabel: 'Mon–Sat, 09:00–19:00.',
    verified: true,
    ratingAvg: 4.9,
    completedCount: 410,
    services: [
      { name: 'Skin fade', durationMinutes: 30, priceUsdCents: 1000 },
      { name: 'Line-up', durationMinutes: 15, priceUsdCents: 500 },
    ],
  },
];

const BOOKING_IDS = {
  awaiting: '44444444-4444-4444-8444-444444444441',
  cashReconcile: '44444444-4444-4444-8444-444444444442',
  completed: '44444444-4444-4444-8444-444444444443',
} as const;

const CONVERSATION_TARIRO_ID = '55555555-5555-4555-8555-555555555551';

async function main() {
  await prisma.city.upsert({
    where: { id: HARARE_CITY_ID },
    update: {},
    create: {
      id: HARARE_CITY_ID,
      name: 'Harare',
      timezone: 'Africa/Harare',
      centroidLat: -17.8252,
      centroidLng: 31.0335,
      bboxWest: 30.9,
      bboxSouth: -18.0,
      bboxEast: 31.2,
      bboxNorth: -17.6,
    },
  });

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name },
      create: category,
    });
  }

  await prisma.user.upsert({
    where: { id: CLIENT_USER_ID },
    update: {},
    create: {
      id: CLIENT_USER_ID,
      phone: '+263771234567',
      displayName: 'Demo Client',
      activeRole: 'client',
      verificationStatus: 'verified',
      cityId: HARARE_CITY_ID,
    },
  });

  for (const provider of PROVIDERS) {
    await prisma.user.upsert({
      where: { id: provider.userId },
      update: {},
      create: {
        id: provider.userId,
        phone: provider.phone,
        displayName: provider.displayName,
        activeRole: 'provider',
        verificationStatus: provider.verified ? 'verified' : 'unverified',
        cityId: HARARE_CITY_ID,
      },
    });

    await prisma.providerProfile.upsert({
      where: { id: provider.id },
      update: {},
      create: {
        id: provider.id,
        userId: provider.userId,
        displayName: provider.displayName,
        tint: provider.tint,
        initials: provider.initials,
        categoryId: provider.categoryId,
        areaName: provider.areaName,
        latitude: provider.latitude,
        longitude: provider.longitude,
        cityId: HARARE_CITY_ID,
        yearsExperience: provider.yearsExperience,
        priceDisplay: provider.priceDisplay,
        fromPriceUsdCents: provider.fromPriceUsdCents,
        workingHoursLabel: provider.workingHoursLabel,
        verified: provider.verified,
        ratingAvg: provider.ratingAvg,
        completedCount: provider.completedCount,
        services: { create: provider.services },
      },
    });
  }

  // One booking per Bookings-screen row state (handoff screen 9) — same
  // three states apps/mobile/src/fixtures/bookings.ts seeds client-side.
  const tarirosCornrows = await prisma.service.findFirstOrThrow({
    where: { providerId: PROVIDER_IDS.tariro, name: 'Cornrows' },
  });
  const kudzaisGelOverlay = await prisma.service.findFirstOrThrow({
    where: { providerId: PROVIDER_IDS.kudzai, name: 'Gel overlay' },
  });
  const rudosSkinFade = await prisma.service.findFirstOrThrow({
    where: { providerId: PROVIDER_IDS.rudo, name: 'Skin fade' },
  });

  await prisma.booking.upsert({
    where: { id: BOOKING_IDS.awaiting },
    update: {},
    create: {
      id: BOOKING_IDS.awaiting,
      reference: formatBookingReference(1001),
      clientId: CLIENT_USER_ID,
      providerId: PROVIDER_IDS.tariro,
      serviceId: tarirosCornrows.id,
      startsAt: new Date(Date.now() + 90 * 60_000),
      paymentMethod: 'ecocash',
      status: 'awaiting_provider',
      priceUsdCents: 1800,
      confirmedByClient: false,
      confirmedByProvider: false,
    },
  });

  await prisma.booking.upsert({
    where: { id: BOOKING_IDS.cashReconcile },
    update: {},
    create: {
      id: BOOKING_IDS.cashReconcile,
      reference: formatBookingReference(1002),
      clientId: CLIENT_USER_ID,
      providerId: PROVIDER_IDS.kudzai,
      serviceId: kudzaisGelOverlay.id,
      startsAt: new Date(Date.now() - 24 * 60 * 60_000 + 13 * 60 * 60_000),
      paymentMethod: 'cash',
      status: 'confirmed',
      priceUsdCents: 1200,
      confirmedByClient: false,
      confirmedByProvider: true,
    },
  });

  await prisma.booking.upsert({
    where: { id: BOOKING_IDS.completed },
    update: {},
    create: {
      id: BOOKING_IDS.completed,
      reference: formatBookingReference(1003),
      clientId: CLIENT_USER_ID,
      providerId: PROVIDER_IDS.rudo,
      serviceId: rudosSkinFade.id,
      startsAt: new Date(Date.now() - 3 * 24 * 60 * 60_000),
      paymentMethod: 'cash',
      status: 'completed',
      priceUsdCents: 1000,
      confirmedByClient: true,
      confirmedByProvider: true,
    },
  });

  // The one conversation apps/mobile/src/fixtures/conversations.ts seeds.
  await prisma.conversation.upsert({
    where: { id: CONVERSATION_TARIRO_ID },
    update: {},
    create: {
      id: CONVERSATION_TARIRO_ID,
      clientId: CLIENT_USER_ID,
      providerUserId: PROVIDER_USER_IDS.tariro,
      lastMessageAt: new Date(Date.now() - 25 * 60_000),
      messages: {
        create: [
          {
            authorId: CLIENT_USER_ID,
            text: 'Hi! Are you free for cornrows today around 4:30?',
            createdAt: new Date(Date.now() - 60 * 60_000),
          },
          {
            authorId: PROVIDER_USER_IDS.tariro,
            text: 'Yes, 16:30 works. Home visit or my place in Avondale?',
            createdAt: new Date(Date.now() - 55 * 60_000),
          },
          {
            authorId: CLIENT_USER_ID,
            text: "I'll come to you.",
            createdAt: new Date(Date.now() - 50 * 60_000),
          },
          {
            authorId: PROVIDER_USER_IDS.tariro,
            text: 'See you at 16:30 then!',
            createdAt: new Date(Date.now() - 25 * 60_000),
          },
        ],
      },
    },
  });

  // The demo client is also the seeded agent (referral code "SC-TARI7",
  // 14 coins — apps/mobile/src/fixtures/wallet.ts's exact example).
  const agent = await prisma.agent.upsert({
    where: { userId: CLIENT_USER_ID },
    update: {},
    create: {
      userId: CLIENT_USER_ID,
      referralCode: 'SC-TARI7',
      verificationStatus: 'verified',
      status: 'active',
    },
  });

  const referrals = [
    { referredName: "Kudzai's Kutz", coinsAwarded: 6, status: 'paid' as const },
    { referredName: 'Nyasha Beauty Bar', coinsAwarded: 6, status: 'paid' as const },
    { referredName: 'R. Moyo', coinsAwarded: 2, status: 'pending' as const },
  ];

  const existingReferrals = await prisma.referral.count({ where: { agentId: agent.id } });
  if (existingReferrals === 0) {
    for (const referral of referrals) {
      await prisma.referral.create({ data: { ...referral, agentId: agent.id } });
    }
    for (const referral of referrals) {
      await prisma.walletTransaction.create({
        data: {
          userId: CLIENT_USER_ID,
          type: 'referral_coin',
          coins: referral.coinsAwarded,
          usdCents: referral.coinsAwarded * 50,
          reference: referral.referredName,
        },
      });
    }
  }

  /**
   * Marketplace stock. Deliberately spread across sellers and includes one
   * low-stock and one sold-out line, because "2 left" and "sold out" are
   * states the buy flow has to handle and an all-plentiful catalogue never
   * exercises them.
   */
  const PRODUCTS: {
    id: string;
    providerId: string;
    name: string;
    description: string;
    priceUsdCents: number;
    stockQty: number;
  }[] = [
    {
      id: '66666666-6666-4666-8666-666666666601',
      providerId: PROVIDER_IDS.tariro,
      name: 'Brazilian braiding hair — 3 pack',
      description: 'Pre-stretched, 26 inch. Enough for a full head of knotless braids.',
      priceUsdCents: 1500,
      stockQty: 12,
    },
    {
      id: '66666666-6666-4666-8666-666666666602',
      providerId: PROVIDER_IDS.tariro,
      name: 'Edge control gel — 120ml',
      description: 'Strong hold, no flaking. Lasts a full week of braids.',
      priceUsdCents: 600,
      stockQty: 2,
    },
    {
      id: '66666666-6666-4666-8666-666666666603',
      providerId: PROVIDER_IDS.chiedza,
      name: 'Human hair wig — shoulder length',
      description: 'Lace front, natural black. Can be dyed and heat-styled.',
      priceUsdCents: 8500,
      stockQty: 3,
    },
    {
      id: '66666666-6666-4666-8666-666666666604',
      providerId: PROVIDER_IDS.kudzai,
      name: 'Gel polish set — 6 colours',
      description: 'Salon-grade, UV cure. The set she uses for full overlays.',
      priceUsdCents: 3200,
      stockQty: 5,
    },
    {
      id: '66666666-6666-4666-8666-666666666605',
      providerId: PROVIDER_IDS.kudzai,
      name: 'Nail care kit',
      description: 'Cuticle oil, buffer, and a pusher — the aftercare set for a fresh set.',
      priceUsdCents: 1200,
      stockQty: 0,
    },
    {
      id: '66666666-6666-4666-8666-666666666606',
      providerId: PROVIDER_IDS.rudo,
      name: 'Beard oil — 50ml',
      description: 'Argan and jojoba. Softens coarse growth without a greasy finish.',
      priceUsdCents: 900,
      stockQty: 8,
    },
  ];

  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: product,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: 1 city, 7 categories, 6 users, 5 providers, 3 bookings, 1 conversation, 1 agent, ${String(PRODUCTS.length)} products.`,
  );
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
