ALTER TABLE "User"
  ADD COLUMN "verificationIdDocumentUrl" TEXT,
  ADD COLUMN "verificationSelfieImageUrl" TEXT,
  ADD COLUMN "verificationNote" TEXT,
  ADD COLUMN "verificationSubmittedAt" TIMESTAMP(3);
