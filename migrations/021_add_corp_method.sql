-- Fix for databases created before corp_method was added to the months table.
-- Safe to run multiple times.
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_method text DEFAULT 'sqft';
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_value double precision;
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rounding text DEFAULT 'nearest';
UPDATE months SET corp_method = 'sqft' WHERE corp_method IS NULL;
UPDATE months SET corp_rounding = 'nearest' WHERE corp_rounding IS NULL;
