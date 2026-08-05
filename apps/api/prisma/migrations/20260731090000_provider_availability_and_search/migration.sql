-- Availability. Until now the "Available now" list on Home was a radius
-- filter and a distance sort with no notion of availability at all, so a
-- stylist who had closed for the day still appeared under a live indicator.
-- Defaults to true so every existing provider keeps showing up; a provider
-- opts out rather than having to opt in.
ALTER TABLE "ProviderProfile" ADD COLUMN "acceptingBookings" BOOLEAN NOT NULL DEFAULT true;

-- Partial index: every catalogue query filters on this being true, and the
-- false rows are the minority we never scan.
CREATE INDEX "ProviderProfile_acceptingBookings_idx"
  ON "ProviderProfile" ("acceptingBookings")
  WHERE "acceptingBookings" = true;

-- Trigram search. pg_trgm is already enabled (see the full_schema migration);
-- these are the indexes that make it usable. Without them the search added
-- earlier was `ILIKE '%term%'`, which cannot use a btree index and can only
-- match substrings — so "braider" found nothing, because the catalogue says
-- "Braiding". GIN + trigram gives both index-backed ILIKE and similarity
-- matching for near-misses and typos.
CREATE INDEX "ProviderProfile_displayName_trgm_idx"
  ON "ProviderProfile" USING GIN ("displayName" gin_trgm_ops);

CREATE INDEX "ProviderProfile_areaName_trgm_idx"
  ON "ProviderProfile" USING GIN ("areaName" gin_trgm_ops);

CREATE INDEX "Category_name_trgm_idx"
  ON "Category" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Service_name_trgm_idx"
  ON "Service" USING GIN ("name" gin_trgm_ops);
