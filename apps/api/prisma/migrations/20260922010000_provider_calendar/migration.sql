ALTER TABLE "ProviderProfile" ADD COLUMN "weeklyHours" JSONB;

CREATE TABLE "ProviderTimeOff" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "note" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderTimeOff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderTimeOff_valid_range" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "ProviderTimeOff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProviderTimeOff_providerId_startsAt_endsAt_idx" ON "ProviderTimeOff"("providerId", "startsAt", "endsAt");
