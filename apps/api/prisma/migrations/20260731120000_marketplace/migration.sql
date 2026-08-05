-- Marketplace: stylists sell physical goods, buyers collect from them.
-- Sellers are existing ProviderProfiles rather than a new entity, so
-- verification, ratings, location and the EcoCash payout path all carry over
-- unchanged.

CREATE TYPE "OrderStatus" AS ENUM ('reserved', 'collected', 'cancelled');

CREATE TABLE "Product" (
  "id"            TEXT NOT NULL,
  "providerId"    TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "priceUsdCents" INTEGER NOT NULL,
  "stockQty"      INTEGER NOT NULL DEFAULT 0,
  "imageUrls"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- Stock can never go negative. The reservation path locks and checks in
-- application code, but overselling is the failure that costs a real customer
-- a real item, so the database refuses it outright as well.
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockQty_non_negative" CHECK ("stockQty" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_positive" CHECK ("priceUsdCents" > 0);

CREATE INDEX "Product_providerId_idx" ON "Product" ("providerId");
CREATE INDEX "Product_active_idx" ON "Product" ("active");

-- Free-text search over the catalogue, same trigram approach as the stylist
-- search so "wig" and a near-miss both land.
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

CREATE TABLE "Order" (
  "id"            TEXT NOT NULL,
  "reference"     TEXT NOT NULL,
  "buyerId"       TEXT NOT NULL,
  "providerId"    TEXT NOT NULL,
  "status"        "OrderStatus" NOT NULL DEFAULT 'reserved',
  "paymentMethod" "PaymentMethod" NOT NULL,
  "totalUsdCents" INTEGER NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_reference_key" ON "Order" ("reference");
CREATE INDEX "Order_buyerId_idx" ON "Order" ("buyerId");
CREATE INDEX "Order_providerId_idx" ON "Order" ("providerId");

CREATE TABLE "OrderItem" (
  "id"            TEXT NOT NULL,
  "orderId"       TEXT NOT NULL,
  "productId"     TEXT NOT NULL,
  "nameSnapshot"  TEXT NOT NULL,
  "priceUsdCents" INTEGER NOT NULL,
  "quantity"      INTEGER NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem" ("orderId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One money ledger for both sale types, so escrow held, released and refunded
-- reconciles in a single place rather than two parallel systems.
ALTER TABLE "Payment" ALTER COLUMN "bookingId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Payment_orderId_idx" ON "Payment" ("orderId");

-- A payment row belongs to exactly one sale. Without this, dropping the NOT
-- NULL above would allow a row attached to neither, which reconciliation
-- could never account for.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exactly_one_subject"
  CHECK (("bookingId" IS NOT NULL AND "orderId" IS NULL) OR ("bookingId" IS NULL AND "orderId" IS NOT NULL));

-- Matches the booking reference counter; "SC-M0001" is the order form.
CREATE SEQUENCE IF NOT EXISTS order_reference_seq START WITH 1;
