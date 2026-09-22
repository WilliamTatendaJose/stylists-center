ALTER TABLE "User"
  ADD COLUMN "bookingRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pickupRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
