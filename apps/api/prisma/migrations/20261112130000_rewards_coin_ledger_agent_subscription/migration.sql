-- New ledger movement types. Added without being used in this migration
-- (a new enum value can't be used in the transaction that adds it).
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'booking_reward';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'purchase_reward';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'referral_purchase';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'redeem_debit';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'redeem_credit';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'expiry';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'refund';

CREATE TYPE "CoinPool" AS ENUM ('spend', 'cash', 'agent');

ALTER TABLE "WalletTransaction"
  ADD COLUMN "pool" "CoinPool" NOT NULL DEFAULT 'cash',
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "remainingCoins" INTEGER,
  ADD COLUMN "dedupeKey" TEXT;

-- Until now the only coins were agent referral rewards and their cash-outs.
UPDATE "WalletTransaction" SET "pool" = 'agent' WHERE "type"::text IN ('referral_coin', 'cash_out');

CREATE UNIQUE INDEX "WalletTransaction_dedupeKey_key" ON "WalletTransaction"("dedupeKey");

CREATE TABLE "WalletCoinSpend" (
  "id" TEXT NOT NULL,
  "debitTxnId" TEXT NOT NULL,
  "lotTxnId" TEXT NOT NULL,
  "coins" INTEGER NOT NULL,
  CONSTRAINT "WalletCoinSpend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalletCoinSpend_debitTxnId_lotTxnId_key" ON "WalletCoinSpend"("debitTxnId", "lotTxnId");
CREATE INDEX "WalletCoinSpend_lotTxnId_idx" ON "WalletCoinSpend"("lotTxnId");
ALTER TABLE "WalletCoinSpend" ADD CONSTRAINT "WalletCoinSpend_debitTxnId_fkey" FOREIGN KEY ("debitTxnId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletCoinSpend" ADD CONSTRAINT "WalletCoinSpend_lotTxnId_fkey" FOREIGN KEY ("lotTxnId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Agent" ADD COLUMN "subscriptionPaidUntil" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN "agentId" TEXT;
CREATE INDEX "Payment_agentId_idx" ON "Payment"("agentId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A payment belongs to exactly one subject; an agent subscription is the fourth.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_exactly_one_subject_chk";
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_exactly_one_subject_chk"
  CHECK (
    (CASE WHEN "bookingId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "orderId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "subscriptionProviderId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "agentId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
