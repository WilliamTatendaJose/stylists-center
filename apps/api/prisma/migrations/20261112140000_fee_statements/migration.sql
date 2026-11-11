-- CreateEnum
CREATE TYPE "FeeReminderKind" AS ENUM ('before_due', 'on_due', 'overdue');

-- AlterTable: the gateway rows of a stylist or vendor paying their fee balance
ALTER TABLE "Payment" ADD COLUMN "feeProviderId" TEXT;

-- A payment belongs to exactly one thing; a fee payment is now a fourth kind.
-- NOTE for merging: any other workstream that adds a Payment subject (e.g.
-- agent subscriptions) must widen this same constraint; the last migration to
-- run wins, so combine the terms into one definition when merging.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_exactly_one_subject_chk";

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_exactly_one_subject_chk"
  CHECK (
    (CASE WHEN "bookingId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "orderId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "subscriptionProviderId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "feeProviderId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- CreateTable
CREATE TABLE "FeeStatement" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingUsdCents" INTEGER NOT NULL,
    "bookingFeesUsdCents" INTEGER NOT NULL,
    "orderFeesUsdCents" INTEGER NOT NULL,
    "waiversUsdCents" INTEGER NOT NULL,
    "paymentsUsdCents" INTEGER NOT NULL,
    "adjustmentsUsdCents" INTEGER NOT NULL,
    "closingUsdCents" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeReminder" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "kind" "FeeReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeStatement_dueAt_idx" ON "FeeStatement"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStatement_providerId_month_key" ON "FeeStatement"("providerId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FeeReminder_statementId_kind_key" ON "FeeReminder"("statementId", "kind");

-- CreateIndex
CREATE INDEX "Payment_feeProviderId_idx" ON "Payment"("feeProviderId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_feeProviderId_fkey" FOREIGN KEY ("feeProviderId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStatement" ADD CONSTRAINT "FeeStatement_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminder" ADD CONSTRAINT "FeeReminder_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FeeStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
