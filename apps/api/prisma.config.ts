import 'dotenv/config';
import { defineConfig } from '@prisma/config';

/**
 * Prisma 7 moved the migration connection string out of schema.prisma and
 * into this file (PrismaClient itself gets its connection via a driver
 * `adapter` at construction — see PrismaService). `dotenv/config` loads
 * apps/api/.env so `prisma migrate dev` picks up DATABASE_URL the same way
 * the app does.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
