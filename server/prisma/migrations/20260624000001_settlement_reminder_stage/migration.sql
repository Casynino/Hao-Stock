-- Track which deadline reminders (24h/6h/1h) have already been sent for a
-- settlement so the automated sweep never double-notifies a rep.
-- 0 = none, 1 = 24h sent, 2 = 6h sent, 3 = 1h sent.
ALTER TABLE "settlements" ADD COLUMN "reminderStage" INTEGER NOT NULL DEFAULT 0;
