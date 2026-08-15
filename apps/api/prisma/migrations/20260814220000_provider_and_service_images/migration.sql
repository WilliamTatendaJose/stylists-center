ALTER TABLE "ProviderProfile" ADD COLUMN "profileImageUrl" TEXT;

ALTER TABLE "Service"
ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
