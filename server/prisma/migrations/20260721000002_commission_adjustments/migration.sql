-- Manual commission deductions share the penalty ledger: settlement optional + kind
ALTER TABLE "settlement_penalties" ALTER COLUMN "settlementId" DROP NOT NULL;
ALTER TABLE "settlement_penalties" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'LATE_FINE';
UPDATE "settlement_penalties" SET "kind" = 'EXPIRY_FINE' WHERE "daysOverdue" = 0;
