-- Hand-written (never via `migrate dev`'s auto-diff — see the geography
-- column migration for why): a global monotonic counter for the "SC-4471"
-- booking reference, race-free under concurrent creates. Starts past the
-- seed data's 1001-1003.
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq START WITH 1004;
