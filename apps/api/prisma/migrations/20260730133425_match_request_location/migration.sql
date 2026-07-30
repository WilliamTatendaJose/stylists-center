-- Hand-written (not `prisma migrate dev --create-only`): ProviderProfile's
-- generated "location" geography column is unmanaged by Prisma (added by a
-- prior hand-written migration, since Prisma has no Unsupported-type story
-- for `geography`), so the auto-diff wizard sees it as drift and tries to
-- DROP it on every subsequent `migrate dev` run. Writing this migration by
-- hand avoids ever running that wizard against the real dev database again.

-- AlterTable
ALTER TABLE "MatchRequest" ADD COLUMN "latitude" DOUBLE PRECISION NOT NULL,
                           ADD COLUMN "longitude" DOUBLE PRECISION NOT NULL;
