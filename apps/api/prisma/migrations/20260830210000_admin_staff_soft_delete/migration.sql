ALTER TABLE "AdminUser" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "AdminUser_deletedAt_idx" ON "AdminUser"("deletedAt");
