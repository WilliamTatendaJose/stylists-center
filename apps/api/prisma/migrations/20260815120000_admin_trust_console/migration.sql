-- Trust & safety report resolution notes and ban appeal notes.
ALTER TABLE "Report" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "Ban" ADD COLUMN "appealNote" TEXT;

-- Staff identity for the admin console. Deliberately separate from "User" —
-- email + password, not phone + OTP.
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE INDEX "AdminUser_email_idx" ON "AdminUser"("email");

-- Mirrors "RefreshToken"'s rotation-with-reuse-detection scheme, kept as a
-- separate table so an admin session can never be confused with (or forged
-- from) a user session's refresh token.
CREATE TABLE "AdminRefreshToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminRefreshToken_tokenHash_key" ON "AdminRefreshToken"("tokenHash");
CREATE INDEX "AdminRefreshToken_adminUserId_idx" ON "AdminRefreshToken"("adminUserId");
CREATE INDEX "AdminRefreshToken_familyId_idx" ON "AdminRefreshToken"("familyId");
ALTER TABLE "AdminRefreshToken" ADD CONSTRAINT "AdminRefreshToken_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog gains an admin-actor column, mutually exclusive with the existing
-- user "actorId" — a request is either a signed-in user's or a staff
-- member's, never both.
ALTER TABLE "AuditLog" ADD COLUMN "adminActorId" TEXT;
CREATE INDEX "AuditLog_adminActorId_idx" ON "AuditLog"("adminActorId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminActorId_fkey"
    FOREIGN KEY ("adminActorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
