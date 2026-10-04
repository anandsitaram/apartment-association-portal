-- Repair billing columns for existing production databases.
-- Safe to run repeatedly; preserves existing month records and settings.
ALTER TABLE months ADD COLUMN IF NOT EXISTS method text DEFAULT 'divide';
ALTER TABLE months ADD COLUMN IF NOT EXISTS value double precision;
ALTER TABLE months ADD COLUMN IF NOT EXISTS calculated_expense_total double precision;
ALTER TABLE months ADD COLUMN IF NOT EXISTS rounding text DEFAULT 'none';
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rate double precision DEFAULT 0.5;
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rounding text DEFAULT 'nearest';
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_method text DEFAULT 'sqft';
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_applicable boolean DEFAULT true;
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_value double precision;
ALTER TABLE months ADD COLUMN IF NOT EXISTS notes jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE months SET corp_method = 'sqft' WHERE corp_method IS NULL;
UPDATE months SET corp_rounding = 'nearest' WHERE corp_rounding IS NULL;
UPDATE months SET corp_applicable = true WHERE corp_applicable IS NULL;
