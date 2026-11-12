-- New order statuses for delivery. ADD VALUE is safe on a live table and the
-- new values are not used in this migration, so it can run in the same transaction.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'delivered';

-- CreateEnum
CREATE TYPE "FulfilmentMethod" AS ENUM ('collection', 'delivery');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable: existing profiles are all stylists, so they keep offering services.
ALTER TABLE "ProviderProfile" ADD COLUMN "offersServices" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: existing orders were all collected in person with no delivery or coins.
ALTER TABLE "Order"
  ADD COLUMN "fulfilment" "FulfilmentMethod" NOT NULL DEFAULT 'collection',
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "deliveryChargeUsdCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coinsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coinsValueUsdCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completedAt" TIMESTAMP(3);

-- Collected orders already happened; give them a completion time (best known: last update).
UPDATE "Order" SET "completedAt" = "updatedAt" WHERE "status" = 'collected';

-- CreateTable
CREATE TABLE "VendorApplication" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "shopAddress" TEXT NOT NULL,
    "shopLat" DOUBLE PRECISION,
    "shopLng" DOUBLE PRECISION,
    "premisesPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'pending',
    "reviewedByAdminId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivers" BOOLEAN NOT NULL DEFAULT false,
    "deliveryChargeUsdCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collectionAddress" TEXT,
    "collectionHours" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorApplication_providerId_key" ON "VendorApplication"("providerId");

-- CreateIndex
CREATE INDEX "VendorApplication_status_submittedAt_idx" ON "VendorApplication"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing sellers are NOT approved automatically: every shop, including
-- those already listing products, applies and is approved by StylistsCenter
-- staff. Their products stay in the database and reappear once approved.
