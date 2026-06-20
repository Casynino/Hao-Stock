-- Add the two new return-approval statuses.
-- These run in their own transaction; the data migration that USES these
-- values lives in the next migration so it runs after these are committed.

-- AlterEnum
ALTER TYPE "ReturnStatus" ADD VALUE 'APPROVED';

-- AlterEnum
ALTER TYPE "ReturnStatus" ADD VALUE 'REJECTED';
