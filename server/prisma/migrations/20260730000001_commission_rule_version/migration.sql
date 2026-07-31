-- Freeze the commission rule per order. Every EXISTING order keeps V1 (the flat
-- per-box rate) so no historical commission is ever re-priced. Orders created
-- from 1 Aug 2026 00:00 EAT get V2 (per-brand rates) from the application.
ALTER TABLE "settlements" ADD COLUMN "commissionRuleVersion" TEXT NOT NULL DEFAULT 'V1';
