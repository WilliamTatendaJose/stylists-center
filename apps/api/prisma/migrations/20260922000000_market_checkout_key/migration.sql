ALTER TABLE "Order"
  ADD COLUMN "checkoutKey" TEXT,
  ADD COLUMN "checkoutFingerprint" TEXT,
  ADD COLUMN "checkoutUrl" TEXT,
  ADD COLUMN "checkoutInstructions" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "pickupAddress" TEXT,
  ADD COLUMN "pickupHours" TEXT,
  ADD COLUMN "pickupLat" DOUBLE PRECISION,
  ADD COLUMN "pickupLng" DOUBLE PRECISION,
  ADD COLUMN "pickupNote" TEXT;

CREATE UNIQUE INDEX "Order_buyerId_checkoutKey_key" ON "Order"("buyerId", "checkoutKey");

ALTER TABLE "Product" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "Product" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Product_category_active_idx" ON "Product"("category") WHERE active = true;

CREATE TABLE "ProductReview" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "text" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductReview_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductReview_orderId_productId_key" ON "ProductReview"("orderId", "productId");
CREATE INDEX "ProductReview_productId_createdAt_idx" ON "ProductReview"("productId", "createdAt");
