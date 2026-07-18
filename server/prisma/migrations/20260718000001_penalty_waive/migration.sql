-- Forgivable penalties: WAIVED fines stay on record but stop reducing commission
ALTER TABLE "settlement_penalties" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPLIED';
ALTER TABLE "settlement_penalties" ADD COLUMN "waivedAt" TIMESTAMP(3);
ALTER TABLE "settlement_penalties" ADD COLUMN "waivedById" TEXT;
ALTER TABLE "settlement_penalties" ADD COLUMN "waiveReason" TEXT;
