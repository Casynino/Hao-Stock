-- Now that APPROVED and REJECTED are committed, migrate legacy data and add
-- the approval-decision columns.

-- Migrate old COMPLETED records (pre-approval-flow) to APPROVED so they are
-- treated as already-verified by the new workflow.
UPDATE "returns" SET "status" = 'APPROVED' WHERE "status" = 'COMPLETED';

-- New returns default to PENDING (awaiting warehouse verification).
ALTER TABLE "returns" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Approval / rejection metadata columns.
ALTER TABLE "returns"
  ADD COLUMN "decidedById"     TEXT,
  ADD COLUMN "decidedAt"       TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
