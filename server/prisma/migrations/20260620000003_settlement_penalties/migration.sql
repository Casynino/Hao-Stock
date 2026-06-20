-- CreateTable
CREATE TABLE "settlement_penalties" (
    "id" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "daysOverdue" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "settlement_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_penalties_salesRepId_idx" ON "settlement_penalties"("salesRepId");

-- CreateIndex
CREATE INDEX "settlement_penalties_settlementId_idx" ON "settlement_penalties"("settlementId");

-- CreateIndex
CREATE INDEX "settlement_penalties_appliedAt_idx" ON "settlement_penalties"("appliedAt");

-- AddForeignKey
ALTER TABLE "settlement_penalties" ADD CONSTRAINT "settlement_penalties_salesRepId_fkey"
    FOREIGN KEY ("salesRepId") REFERENCES "sales_representatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_penalties" ADD CONSTRAINT "settlement_penalties_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
