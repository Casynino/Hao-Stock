-- Brand dimension across finance: every transaction can carry the brand it
-- belongs to (separating "whose money" from "which account holds it"), a
-- settlement submission records which payment account the rep paid into, and
-- suppliers link to a brand.
ALTER TABLE "finance_transactions" ADD COLUMN "brandId" TEXT;
CREATE INDEX "finance_transactions_brandId_idx" ON "finance_transactions"("brandId");

ALTER TABLE "settlement_submissions" ADD COLUMN "accountId" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "brandId" TEXT;
