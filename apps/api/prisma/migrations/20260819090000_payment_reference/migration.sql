-- The gateway reference a payment was initiated under. Bookings and orders
-- have their own `reference` column for the Paynow callback to match on, but
-- a subscription payment has no such row — so a callback for one had nothing
-- to resolve against and was rejected as an unknown reference, leaving
-- subscription payments permanently unreconciled.
--
-- Nullable and non-unique on purpose: rows written before this column existed
-- cannot be backfilled, and the ledger is append-only, so several rows share
-- one reference as a payment moves pending -> paid -> released.

ALTER TABLE "Payment" ADD COLUMN "reference" TEXT;

CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");
