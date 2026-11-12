-- A booking that did not complete: the stylist reported the client did not
-- pay, or neither side confirmed the job within the confirmation window.
-- No fee is charged and no coins are earned for it.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'incomplete';
