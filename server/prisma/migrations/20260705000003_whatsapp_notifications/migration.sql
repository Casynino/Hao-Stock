-- Outbound WhatsApp notification log / dedupe guard / retry queue
CREATE TABLE "whatsapp_notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'INFO',
    "refType" TEXT,
    "refId" TEXT,
    "dedupeKey" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_notifications_dedupeKey_key" ON "whatsapp_notifications"("dedupeKey");
CREATE INDEX "whatsapp_notifications_status_idx" ON "whatsapp_notifications"("status");
CREATE INDEX "whatsapp_notifications_createdAt_idx" ON "whatsapp_notifications"("createdAt");
