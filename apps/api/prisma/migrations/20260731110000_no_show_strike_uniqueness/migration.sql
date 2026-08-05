-- One strike per user per booking per reason.
--
-- Strikes count toward an automatic ban at five, so a duplicate is not a
-- cosmetic bug — it is a fifth of the way to removing someone's account. The
-- realistic sources of duplicates are ordinary: a client filing the same
-- no-show report twice, or a retried request after a dropped response.
-- Enforced here rather than only in application code because the constraint
-- protects an irreversible outcome.
CREATE UNIQUE INDEX "NoShowRecord_userId_bookingId_reason_key"
  ON "NoShowRecord" ("userId", "bookingId", "reason");
