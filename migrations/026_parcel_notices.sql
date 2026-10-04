CREATE TABLE IF NOT EXISTS parcel_notices (
  id serial PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'default',
  flat text NOT NULL,
  courier text NOT NULL DEFAULT '',
  tracking_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  photo_data text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected')),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by text,
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS parcel_notices_flat_status_idx ON parcel_notices(flat, status, created_at DESC);
