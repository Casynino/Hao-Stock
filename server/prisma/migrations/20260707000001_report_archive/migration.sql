-- Permanent archive of generated business reports (weekly/monthly PDFs)
CREATE TABLE "report_archives" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "pdf" BYTEA NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_archives_type_periodKey_key" ON "report_archives"("type", "periodKey");
CREATE INDEX "report_archives_type_createdAt_idx" ON "report_archives"("type", "createdAt");
