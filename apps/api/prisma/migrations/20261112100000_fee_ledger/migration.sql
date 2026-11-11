-- CreateEnum
CREATE TYPE "FeeEntryKind" AS ENUM ('booking_fee', 'order_fee', 'waiver', 'payment', 'adjustment');

-- CreateTable
CREATE TABLE "FeeLedgerEntry" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "FeeEntryKind" NOT NULL,
    "amountUsdCents" INTEGER NOT NULL,
    "baseUsdCents" INTEGER,
    "rateBps" INTEGER,
    "bookingId" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeLedgerEntry_providerId_createdAt_idx" ON "FeeLedgerEntry"("providerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeLedgerEntry_kind_bookingId_key" ON "FeeLedgerEntry"("kind", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeLedgerEntry_kind_orderId_key" ON "FeeLedgerEntry"("kind", "orderId");

-- AddForeignKey
ALTER TABLE "FeeLedgerEntry" ADD CONSTRAINT "FeeLedgerEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
