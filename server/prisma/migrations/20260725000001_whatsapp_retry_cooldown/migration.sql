-- Retry cool-down: a possibly-delivered attempt is never echoed seconds later
ALTER TABLE "whatsapp_notifications" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
