-- Preserve existing Corp Fund billing for past months; new months default to not applicable.
ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_applicable boolean DEFAULT true;
UPDATE months SET corp_applicable = true WHERE corp_applicable IS NULL;
