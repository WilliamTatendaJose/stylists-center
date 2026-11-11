-- Bookings are paid to the stylist directly: the service fee and any coins
-- used are frozen on the booking, and completion records who confirmed when.
-- Every column is nullable or defaulted, so existing rows stay valid.
ALTER TABLE "Booking"
  ADD COLUMN "confirmedByClientAt" TIMESTAMP(3),
  ADD COLUMN "confirmedByProviderAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "autoCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceFeeUsdCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "serviceFeeBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coinsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coinsUsdCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nonPaymentReportedAt" TIMESTAMP(3),
  ADD COLUMN "nonPaymentNote" TEXT;

-- History: the best available time for an existing confirmation is the last
-- update to the row, so bookings already waiting on the other side start
-- their auto-complete window from there rather than never completing.
UPDATE "Booking" SET "confirmedByClientAt" = "updatedAt" WHERE "confirmedByClient";
UPDATE "Booking" SET "confirmedByProviderAt" = "updatedAt" WHERE "confirmedByProvider";
UPDATE "Booking" SET "completedAt" = "updatedAt" WHERE "status" = 'completed';

CREATE INDEX "Booking_clientId_nonPaymentReportedAt_idx" ON "Booking"("clientId", "nonPaymentReportedAt");
