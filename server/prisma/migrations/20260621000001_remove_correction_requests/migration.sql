-- Remove the Correction Request feature entirely.
-- Reps now edit their own pending orders, and approved orders are settled or
-- returned — the correction workflow is no longer used. Dropping the table also
-- drops its foreign keys to settlements / sales_representatives / users.

DROP TABLE IF EXISTS "correction_requests";
DROP TYPE IF EXISTS "CorrectionStatus";
