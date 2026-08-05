-- Account-standing strikes were modelled but never written: nothing in the
-- codebase created a NoShowRecord, so the "five no-shows remove an account"
-- policy the Bookings screen states was unenforced.
--
-- Cancelling late and simply not turning up are both breaches of the same
-- commitment and both count toward standing, but they are not the same event
-- — one gave the stylist warning and the other did not. Recording which is
-- what makes an appeal reviewable, so `reason` is stored rather than
-- flattening everything into "no-show".
ALTER TABLE "NoShowRecord" ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'no_show';

-- Every read of this table is "how many strikes does this user have", which
-- is a count per user.
CREATE INDEX "NoShowRecord_userId_createdAt_idx" ON "NoShowRecord" ("userId", "createdAt");
