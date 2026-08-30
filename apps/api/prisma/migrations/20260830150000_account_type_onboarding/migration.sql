ALTER TABLE "User"
  ADD COLUMN "selectedAccountType" "ActiveRole",
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Existing accounts have already been using one side of the app. Backfill
-- them so only genuinely new Firebase identities enter the new selector.
UPDATE "User"
SET
  "selectedAccountType" = "activeRole",
  "onboardingCompletedAt" = COALESCE("updatedAt", NOW())
WHERE "deletedAt" IS NULL;
