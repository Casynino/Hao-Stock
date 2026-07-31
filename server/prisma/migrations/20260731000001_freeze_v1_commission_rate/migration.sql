-- Freeze the pre-1-Aug-2026 commission rate as a setting of its own.
--
-- Until now the V1 per-box rate was DERIVED at read time as
--   commission.amountPerThreshold / commission.boxThreshold
-- while amountPerThreshold is also the minimum withdrawal, and both keys are
-- editable from the admin Settings screen. Raising the minimum withdrawal from
-- 250,000 to 300,000 would therefore have re-priced every commission already
-- earned on every order issued before 1 Aug 2026 — silently, with no way back.
--
-- Capture whatever the derivation yields RIGHT NOW so this migration changes no
-- balance anywhere, then let the historical rate stand on its own. Falls back to
-- 5,000 only if the source settings are missing entirely.
INSERT INTO settings (id, key, value, type, "group", description, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'commission.v1PerBox',
  COALESCE(
    (SELECT trim_scale(round(a.value::numeric / NULLIF(b.value::numeric, 0), 2))::text
       FROM settings a, settings b
      WHERE a.key = 'commission.amountPerThreshold'
        AND b.key = 'commission.boxThreshold'),
    '5000'
  ),
  'NUMBER'::"SettingType",
  'commission',
  'Commission per box for orders issued before 1 Aug 2026. Historical fact — frozen so past earnings cannot be re-priced.',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'commission.v1PerBox');

-- Label the survivors so the next person reading the Settings screen knows what
-- each one still does.
UPDATE settings
   SET description = 'Minimum commission balance a rep must reach to request a withdrawal. Money only — it no longer affects any per-box rate.'
 WHERE key = 'commission.amountPerThreshold' AND description IS NULL;

UPDATE settings
   SET description = 'Legacy. Superseded by commission.v1PerBox and no longer read.'
 WHERE key = 'commission.boxThreshold' AND description IS NULL;
