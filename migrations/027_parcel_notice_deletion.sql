-- Allow parcel notices to be explicitly deleted without leaving stale notifications or list entries.
ALTER TABLE parcel_notices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS parcel_notices_flat_active_idx
  ON parcel_notices(flat, created_at DESC)
  WHERE deleted_at IS NULL;
