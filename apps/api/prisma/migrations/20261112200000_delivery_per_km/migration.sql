-- Marketplace delivery is charged per km from the shop to the delivery point.
ALTER TABLE "VendorApplication" ADD COLUMN "deliveryPerKmUsdCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "deliveryLat" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveryLng" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveryDistanceKm" DOUBLE PRECISION;
