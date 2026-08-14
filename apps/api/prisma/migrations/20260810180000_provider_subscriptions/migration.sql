-- Replaces the per-payment platform fee with a flat monthly provider
-- subscription. Existing Payment rows keep whatever feeUsdCents they already
-- have (history is never rewritten); every new booking/order payment is
-- written with feeUsdCents = 0 from here on (application-level change, no
-- migration needed for that half).

ALTER TABLE "ProviderProfile"
  ADD COLUMN "subscriptionPriceUsdCents" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "subscriptionPaidUntil" TIMESTAMP(3);

ALTER TABLE "Payment"
  ADD COLUMN "subscriptionProviderId" TEXT;

CREATE INDEX "Payment_subscriptionProviderId_idx" ON "Payment"("subscriptionProviderId");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_subscriptionProviderId_fkey"
  FOREIGN KEY ("subscriptionProviderId") REFERENCES "ProviderProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The existing "exactly one of bookingId/orderId" check (from the
-- marketplace migration) is a strict two-way XOR — it rejects a row where
-- BOTH are null, which is exactly what a subscription payment is. Replace it
-- with the three-way version below rather than widen it in place, so the
-- constraint's own definition stays a single readable expression.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_exactly_one_subject";

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_exactly_one_subject_chk"
  CHECK (
    (CASE WHEN "bookingId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "orderId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "subscriptionProviderId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
