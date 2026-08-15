ALTER TABLE "Referral"
  ADD COLUMN "referredUserId" TEXT;

CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

ALTER TABLE "Referral"
  ADD CONSTRAINT "Referral_referredUserId_fkey"
  FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
