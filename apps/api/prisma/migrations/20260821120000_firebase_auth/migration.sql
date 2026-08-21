-- Firebase becomes the credential authority. Existing phone accounts remain
-- intact and can be linked later; new accounts are identified by Firebase UID.
ALTER TABLE "User"
  ADD COLUMN "firebaseUid" TEXT,
  ADD COLUMN "email" TEXT,
  ALTER COLUMN "phone" DROP NOT NULL;

CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
