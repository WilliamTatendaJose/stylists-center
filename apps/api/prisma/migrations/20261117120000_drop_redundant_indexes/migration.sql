-- Each of these single-column indexes is the leading column of a wider index
-- on the same table, so every query it served is served by that one instead,
-- and each write no longer has to update both.
--   Booking(clientId)            -> Booking(clientId, nonPaymentReportedAt)
--   Booking(providerId)          -> Booking(providerId, startsAt DESC)
--   Order(buyerId)               -> unique Order(buyerId, checkoutKey)
--   Order(providerId)            -> Order(providerId, createdAt DESC)
--   Review(rateeId)              -> Review(rateeId, createdAt DESC)
--   WalletTransaction(userId)    -> WalletTransaction(userId, createdAt DESC)
DROP INDEX IF EXISTS "Booking_clientId_idx";
DROP INDEX IF EXISTS "Booking_providerId_idx";
DROP INDEX IF EXISTS "Order_buyerId_idx";
DROP INDEX IF EXISTS "Order_providerId_idx";
DROP INDEX IF EXISTS "Review_rateeId_idx";
DROP INDEX IF EXISTS "WalletTransaction_userId_idx";
