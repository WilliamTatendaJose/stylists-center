-- Which subscription period each agent reminder was sent for, so the daily
-- run sends each one once.
ALTER TABLE "Agent" ADD COLUMN "subscriptionReminderFor" TIMESTAMP(3);
ALTER TABLE "Agent" ADD COLUMN "subscriptionEndedNoticeFor" TIMESTAMP(3);
