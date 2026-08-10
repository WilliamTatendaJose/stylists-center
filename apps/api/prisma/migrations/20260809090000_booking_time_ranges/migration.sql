-- A booking reserves its full service duration, not only its start timestamp.
-- `btree_gist` provides equality support for provider ids inside the GiST
-- exclusion constraint; Postgres then rejects overlapping active appointments.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" ADD COLUMN "endsAt" TIMESTAMP(3);

UPDATE "Booking" AS b
SET "endsAt" = b."startsAt" + (s."durationMinutes" * INTERVAL '1 minute')
FROM "Service" AS s
WHERE s.id = b."serviceId";

ALTER TABLE "Booking" ALTER COLUMN "endsAt" SET NOT NULL;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_provider_time_range_excl"
  EXCLUDE USING GIST (
    "providerId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" NOT IN ('cancelled', 'declined'));