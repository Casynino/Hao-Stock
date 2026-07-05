-- A payment account can be reserved for one brand (M-Pesa → OHIS, Airtel →
-- Civlily). Null = usable by any brand (Cash). Settlement submissions only
-- offer/accept accounts matching the product's brand.
ALTER TABLE "business_accounts" ADD COLUMN "brandId" TEXT;
