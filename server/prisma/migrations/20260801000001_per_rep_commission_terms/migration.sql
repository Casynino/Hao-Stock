-- Per-rep commission terms: a withdrawal minimum that can differ from the
-- business default, and a one-off correction to a rep's earned total.
--
-- Earnings are derived from settled boxes and must stay derived — that is what
-- keeps sales, settlements and analytics honest. So when an account is squared
-- up by agreement, the correction is recorded here rather than by editing the
-- sales that produced it. The boxes stay; the money is adjusted once, visibly.
ALTER TABLE "sales_representatives"
  ADD COLUMN "withdrawalThreshold"      DECIMAL(14,2),
  ADD COLUMN "commissionAdjustment"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "commissionAdjustmentNote" TEXT,
  ADD COLUMN "commissionAdjustedAt"     TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- One-off adjustment for KP (REP-004), agreed 1 Aug 2026.
--
-- His account is squared to zero and his penalties cleared. Every statement
-- below is written to be idempotent and scoped to REP-004 alone, so a re-run
-- or a redeploy cannot touch another rep or double-apply.
-- ---------------------------------------------------------------------------

-- Penalties are WAIVED, not deleted. The nightly sweep decides how many
-- penalty-days it has already charged by counting the rows that exist
-- (penalty.service.js, penaltyDaysDue/charged). Deleting them would reset that
-- count to zero and the next sweep would re-charge the whole backlog — the
-- fines would return, larger, within a day. A waived row still counts as
-- charged, while totalPenaltiesForRep sums only APPLIED rows, so it contributes
-- nothing to his balance and appears in no penalty list.
UPDATE "settlement_penalties"
   SET "status"      = 'WAIVED',
       "waivedAt"    = now(),
       "waiveReason" = 'Account squared by agreement, 1 Aug 2026'
 WHERE "status" = 'APPLIED'
   AND "salesRepId" IN (SELECT "id" FROM "sales_representatives" WHERE "code" = 'REP-004');

-- Earned is 46 OHIS + 21 Civlily settled boxes at the pre-August rate of 5,000
-- = 335,000, against 250,000 already withdrawn. Reducing the earned total by
-- the 85,000 difference leaves earned 250,000, paid out 250,000, available 0 —
-- the account reads as though he reached the threshold, withdrew, and starts
-- clean. All 67 boxes remain recorded and continue to count for reporting.
UPDATE "sales_representatives"
   SET "commissionAdjustment"     = -85000,
       "commissionAdjustmentNote" = 'Account squared to zero by agreement, 1 Aug 2026. 67 settled boxes remain recorded; this offsets the difference between them and the 250,000 already withdrawn.',
       "commissionAdjustedAt"     = now()
 WHERE "code" = 'REP-004'
   AND "commissionAdjustment" = 0;

-- From now on KP withdraws at 500,000 rather than the business default. Every
-- other commission rule is unchanged: he accrues per brand at the current rates
-- exactly like everyone else.
UPDATE "sales_representatives"
   SET "withdrawalThreshold" = 500000
 WHERE "code" = 'REP-004'
   AND "withdrawalThreshold" IS NULL;
