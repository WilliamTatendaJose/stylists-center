-- Additive indexes for the "newest first" lists of the people who accumulate
-- the most rows (stylists, vendors, ledger owners). Each query filters on one
-- person and sorts by time; with only the single-column index the database
-- reads and sorts that person's whole history to return 10-100 rows.

-- Provider job list (GET /v1/provider/bookings).
CREATE INDEX "Booking_providerId_startsAt_idx" ON "Booking"("providerId", "startsAt" DESC);

-- Vendor order list (GET /v1/vendors/orders).
CREATE INDEX "Order_providerId_createdAt_idx" ON "Order"("providerId", "createdAt" DESC);

-- Reviews shown on a provider's page (latest 10).
CREATE INDEX "Review_rateeId_createdAt_idx" ON "Review"("rateeId", "createdAt" DESC);

-- Wallet history and the "last cash-out" lookup.
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt" DESC);
