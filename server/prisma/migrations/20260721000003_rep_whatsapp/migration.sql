-- Per-rep WhatsApp (CallMeBot) + recipient columns on the notification log
ALTER TABLE "sales_representatives" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "sales_representatives" ADD COLUMN "whatsappApiKey" TEXT;
ALTER TABLE "whatsapp_notifications" ADD COLUMN "toPhone" TEXT;
ALTER TABLE "whatsapp_notifications" ADD COLUMN "toApiKey" TEXT;
