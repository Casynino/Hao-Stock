-- CreateEnum
CREATE TYPE "SettlementSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "settlement_submissions" (
    "id" TEXT NOT NULL,
    "submissionNumber" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packagingUnitId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "boxes" INTEGER NOT NULL,
    "baseQuantity" INTEGER NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "method" TEXT,
    "status" "SettlementSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "saleId" TEXT,
    "rejectionReason" TEXT,
    "submittedById" TEXT,
    "decidedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlement_submissions_submissionNumber_key" ON "settlement_submissions"("submissionNumber");

-- CreateIndex
CREATE INDEX "settlement_submissions_settlementId_idx" ON "settlement_submissions"("settlementId");

-- CreateIndex
CREATE INDEX "settlement_submissions_salesRepId_idx" ON "settlement_submissions"("salesRepId");

-- CreateIndex
CREATE INDEX "settlement_submissions_status_idx" ON "settlement_submissions"("status");
