-- Admin roles. Every existing admin becomes an owner so nobody loses access;
-- accounts created from now on default to the least-privileged role.
CREATE TYPE "AdminRole" AS ENUM ('owner', 'finance', 'support');
ALTER TABLE "AdminUser" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'owner';
ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'support';
