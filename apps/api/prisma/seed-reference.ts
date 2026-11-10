import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { CATEGORIES, HARARE_CITY } from './reference-data.js';

/**
 * Production-safe seed: only the city and categories the app cannot work
 * without — no demo users, providers, bookings, or admin credentials (that is
 * prisma/seed.ts, which is for development databases only).
 *
 * Only inserts what is missing, matched by id *or* name (names aren't unique
 * in the schema, and rows added through the admin console have random ids),
 * and never overwrites, so a re-run can't duplicate or undo console edits.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  let cities = 0;
  const cityExists = await prisma.city.findFirst({
    where: { OR: [{ id: HARARE_CITY.id }, { name: HARARE_CITY.name }] },
  });
  if (!cityExists) {
    await prisma.city.create({ data: HARARE_CITY });
    cities += 1;
  }

  let categories = 0;
  for (const category of CATEGORIES) {
    const exists = await prisma.category.findFirst({
      where: { OR: [{ id: category.id }, { name: category.name, parentId: null }] },
    });
    if (!exists) {
      await prisma.category.create({ data: category });
      categories += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Reference data: ${String(cities)} city and ${String(categories)} categories added (existing rows left untouched).`,
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
