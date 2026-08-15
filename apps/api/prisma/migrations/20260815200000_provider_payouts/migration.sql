-- A Payout is an admin's attestation that a real-world transfer to a
-- provider happened outside the app. It never touches the Payment ledger
-- (Payment.status = 'released' only means escrow settled internally, not
-- that money moved) — see the model's doc comment in schema.prisma.

CREATE TABLE "Payout" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "amountUsdCents" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payout_providerId_idx" ON "Payout"("providerId");

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
