-- App-user lifecycle is deliberately soft-delete based. User rows are referenced
-- by immutable booking/payment/audit history, so hard cascading them would either
-- fail or destroy records the business must retain.
ALTER TABLE "User"
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
