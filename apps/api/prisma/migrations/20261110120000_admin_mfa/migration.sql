-- Authenticator-app (TOTP) two-factor sign-in for admin accounts.
-- Secrets are stored encrypted (AES-256-GCM, see admin-auth/secret-box.ts);
-- recovery codes are stored as SHA-256 hashes and removed when used.
ALTER TABLE "AdminUser" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "totpPendingSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "AdminUser" ADD COLUMN "totpLastUsedStep" INTEGER;
ALTER TABLE "AdminUser" ADD COLUMN "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
