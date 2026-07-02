-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "FinanceAccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'OTHER');
CREATE TYPE "FinanceTxnType" AS ENUM ('SETTLEMENT', 'WAREHOUSE_SALE', 'INCOME', 'EXPENSE', 'STOCK_PURCHASE', 'COMMISSION_PAYMENT', 'TRANSFER', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "business_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceAccountType" NOT NULL DEFAULT 'CASH',
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "openingBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "txnNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "type" "FinanceTxnType" NOT NULL DEFAULT 'INCOME',
    "amount" DECIMAL(16,2) NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_txnNumber_key" ON "finance_transactions"("txnNumber");
CREATE INDEX "finance_transactions_accountId_idx" ON "finance_transactions"("accountId");
CREATE INDEX "finance_transactions_direction_idx" ON "finance_transactions"("direction");
CREATE INDEX "finance_transactions_type_idx" ON "finance_transactions"("type");
CREATE INDEX "finance_transactions_occurredAt_idx" ON "finance_transactions"("occurredAt");
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "business_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
