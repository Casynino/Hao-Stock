-- AlterEnum
ALTER TYPE "ReferenceType" ADD VALUE 'SETTLEMENT';

-- AlterTable
ALTER TABLE "settlement_payments" ADD COLUMN     "boxes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "productId" TEXT;

-- CreateIndex
CREATE INDEX "settlement_payments_productId_idx" ON "settlement_payments"("productId");

-- AddForeignKey
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
