import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { hashPassword } from '../src/modules/admin-auth/password.js';

/**
 * The bootstrap admin account, without the rest of prisma/seed.ts's demo
 * fixtures (categories, providers, bookings — all tied to id's the mobile
 * app's fixtures reference, meant for a dev database, not a real one). Run
 * this instead of the full seed against Railway/production.
 *
 * ADMIN_BOOTSTRAP_EMAIL/PASSWORD default to the same dev credential
 * prisma/seed.ts uses so local usage is unchanged; set both explicitly for
 * any database that isn't a laptop.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ADMIN_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@stylistscenter.local';
const ADMIN_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'ChangeMe123!';

async function main() {
  await prisma.adminUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      displayName: 'Admin',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Admin bootstrap complete: ${ADMIN_EMAIL}.`);
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
