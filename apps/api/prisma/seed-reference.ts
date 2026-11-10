import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { CATEGORIES, HARARE_CITY } from './reference-data.js';

/**
 * Production-safe seed: only the city and categories the app cannot work
 * without — no demo users, providers, bookings, or admin credentials (that is
 * prisma/seed.ts, which is for development databases only).
 *
 * Only inserts what is missing and never overwrites, so names an admin has
 * since edited in the console survive a re-run.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const city = await prisma.city.createMany({ data: [HARARE_CITY], skipDuplicates: true });
  const categories = await prisma.category.createMany({ data: CATEGORIES, skipDuplicates: true });
  // eslint-disable-next-line no-console
  console.log(
    `Reference data: ${String(city.count)} city and ${String(categories.count)} categories added (existing rows left untouched).`,
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
