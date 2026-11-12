-- Marketplace service fee the buyer pays on top, frozen per order.
ALTER TABLE "Order" ADD COLUMN "serviceFeeUsdCents" INTEGER NOT NULL DEFAULT 0;
