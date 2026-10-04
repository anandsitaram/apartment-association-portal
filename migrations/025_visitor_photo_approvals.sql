CREATE TABLE IF NOT EXISTS security_access_codes (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  visitor_name text NOT NULL,
  flat text NOT NULL,
  phone text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT 'Visitor',
  status text NOT NULL DEFAULT 'pending',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by text,
  accepted_at timestamptz,
  visit_at timestamptz
);
CREATE TABLE IF NOT EXISTS visitor_photo_requests (
  id serial PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'default',
  access_code_id integer REFERENCES security_access_codes(id) ON DELETE SET NULL,
  visitor_name text NOT NULL,
  flat text NOT NULL,
  purpose text NOT NULL DEFAULT 'Visitor',
  phone text NOT NULL DEFAULT '',
  photo_data text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS visitor_photo_requests_flat_status_idx ON visitor_photo_requests(flat, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS visitor_photo_requests_access_code_uq ON visitor_photo_requests(access_code_id) WHERE access_code_id IS NOT NULL;
