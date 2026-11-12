-- Who carried the booking service fee, frozen per booking from the
-- serviceFeePaidBy setting. Existing bookings had it added to the client's
-- price, so the default matches them.
ALTER TABLE "Booking" ADD COLUMN "clientPaysFee" BOOLEAN NOT NULL DEFAULT true;
