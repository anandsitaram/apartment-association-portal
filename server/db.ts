import seed from "./flats-seed.js";
import { dump } from "./backup.js";
import type { Query, Row } from "./types";
import { decryptData, encryptData } from "./crypto.js";
import { protectBackup } from "./backup.js";

export const SCHEMA_VERSION = 30;
export const APP_TABLES = [
  "months",
  "month_archive",
  "payments",
  "settings",
  "flats",
  "users",
  "audit_log",
  "login_attempts",
  "backups",
  "corpus_ledger",
  "tickets",
  "hall_bookings",
  "gym_bookings",
  "polls",
  "poll_votes",
  "notification_logs",
  "contact_submissions",
  "events",
  "security_events",
  "security_access_codes",
  "visitor_photo_requests",
  "parcel_notices",
];

const url = (): string =>
  process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export const driver = () =>
  (
    process.env.DB_DRIVER || (/\.neon\.tech/i.test(url()) ? "neon" : "pg")
  ).toLowerCase();

export const cleanUrl = (u: string) =>
  u.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]$/, "");
export const useSsl = (u: string) =>
  process.env.DB_SSL !== "off" && !/@(localhost|127\.0\.0\.1)[:/]/i.test(u);

export function decryptRow(row: Row): Row {
  if (!row || typeof row !== "object") return row;
  const out: Row = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === "string" && val.startsWith("ENC:v1:")) {
      const dec = decryptData(val);
      try {
        out[key] = JSON.parse(dec);
      } catch {
        out[key] = dec;
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function connect(): Promise<{ query: Query }> {
  const u = url();
  if (driver() === "neon") {
    const { neon } = await import("@neondatabase/serverless");
    const raw = neon(u) as any;
    const qFn =
      typeof raw?.query === "function"
        ? raw.query.bind(raw)
        : typeof raw === "function"
          ? raw
          : raw;
    return {
      query: async (text: string, params?: unknown[]) => {
        const res = await qFn(text, params);
        const rows = (Array.isArray(res) ? res : res?.rows || []) as Row[];
        return rows ? rows.map(decryptRow) : [];
      },
    };
  }

  const { default: pg } = await import("pg");

  const pool = new pg.Pool({
    connectionString: cleanUrl(u),
    max: 1,
    ssl: useSsl(u)
      ? {
          ca: process.env.DATABASE_CA?.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        }
      : false,
  });
  pool.on("error", (e) =>
    console.error("idle database connection error:", e.message),
  );
  return {
    query: async (text: string, params?: unknown[]) => {
      const res = await pool.query(text, params as any[]);
      return (res.rows as Row[]).map(decryptRow);
    },
  };
}

let client: Promise<{ query: Query }> | undefined;
export const sql: { query: Query } = {
  query: async (text, params) => {
    client ||= connect().catch((e) => {
      client = undefined;
      throw e;
    });
    return (await client).query(text, params);
  },
};

export async function ensureSchema(
  query: Query = (text, params) => sql.query(text, params),
  {
    rls = driver() === "pg" && process.env.DB_RLS !== "off",
  }: { rls?: boolean } = {},
) {
  const [t] = await query("SELECT to_regclass('public.settings') AS t");
  let previous = 0;
  if (t?.t) {
    const [v] = await query(
      "SELECT value FROM settings WHERE key='schema_version'",
    );
    if (v && +v.value === SCHEMA_VERSION) return;
    previous = +v?.value || 0;
  }
  if (previous > 0) {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS backups(id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)`,
      );
      const data = await dump((text) => query(text));
      await query(`INSERT INTO backups(data) VALUES($1::jsonb)`, [
        JSON.stringify(protectBackup(data)),
      ]);
    } catch (e) {
      console.error(
        "backup before upgrade failed (continuing):",
        (e as Error).message,
      );
    }
  }
  const q = (text: string) => query(text);
  await q(
    `CREATE TABLE IF NOT EXISTS months(month text PRIMARY KEY, expenses jsonb NOT NULL DEFAULT '[]', divisor int NOT NULL DEFAULT 25)`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS method text DEFAULT 'divide'`,
  );
  await q(`ALTER TABLE months ADD COLUMN IF NOT EXISTS value double precision`);
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS calculated_expense_total double precision`,
  );
  await q(
    `UPDATE months SET calculated_expense_total = COALESCE((SELECT SUM(COALESCE((item->>'amount')::float8,0)) FROM jsonb_array_elements(COALESCE(months.expenses, '[]'::jsonb)) AS items(item)),0) WHERE calculated_expense_total IS NULL`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS rounding text DEFAULT 'none'`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rate double precision DEFAULT 0.5`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rounding text DEFAULT 'nearest'`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_method text DEFAULT 'sqft'`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_applicable boolean DEFAULT true`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_value double precision`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_2bhk double precision`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_3bhk double precision`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS excluded_flats jsonb NOT NULL DEFAULT '[]'::jsonb`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS excluded_expense_flats jsonb NOT NULL DEFAULT '[]'::jsonb`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS excluded_corp_flats jsonb NOT NULL DEFAULT '[]'::jsonb`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS notes jsonb NOT NULL DEFAULT '{}'::jsonb`,
  );
  // Block allocation is opt-in. Legacy expense lines default to association-wide.
  await q(
    `UPDATE months AS m
     SET expenses = COALESCE((
       SELECT jsonb_agg(
         CASE WHEN jsonb_typeof(item) = 'object'
           THEN item || jsonb_build_object('allocationScope', COALESCE(NULLIF(item->>'allocationScope',''), 'association'))
           ELSE item
         END ORDER BY ordinality
       )
       FROM jsonb_array_elements(COALESCE(m.expenses, '[]'::jsonb)) WITH ORDINALITY AS e(item, ordinality)
     ), '[]'::jsonb)
     WHERE jsonb_typeof(COALESCE(m.expenses, '[]'::jsonb)) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.expenses, '[]'::jsonb)) AS x(item) WHERE jsonb_typeof(item) = 'object' AND NOT (item ? 'allocationScope'))`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS month_archive(month text PRIMARY KEY, data jsonb NOT NULL, deleted_at timestamptz DEFAULT now())`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS payments(month text, flat text, maint double precision DEFAULT 0, corp double precision DEFAULT 0, mode text DEFAULT '', paid_date text DEFAULT '', PRIMARY KEY(month, flat))`,
  );
  await q(
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS extra jsonb DEFAULT '{}'`,
  );
  // One-time migration for months already using combined Maintenance + Corp Fund:
  // fold legacy Corp Fund collections into the single Maintenance payment bucket.
  await q(
    `UPDATE payments AS p
     SET maint=COALESCE(p.maint,0)+COALESCE(p.corp,0), corp=0
     FROM months AS m
     WHERE p.month=m.month
       AND m.notes->>'mergeMaintenanceCorp'='true'
       AND COALESCE(p.corp,0)<>0`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS settings(key text PRIMARY KEY, value jsonb)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS flats(flat text PRIMARY KEY, sl int NOT NULL DEFAULT 0, name text NOT NULL DEFAULT '', type text NOT NULL DEFAULT '', bua double precision NOT NULL DEFAULT 0, uds double precision NOT NULL DEFAULT 0, block text NOT NULL DEFAULT '')`,
  );
  await q(
    `ALTER TABLE flats ADD COLUMN IF NOT EXISTS block text NOT NULL DEFAULT ''`,
  );
  await q(
    `ALTER TABLE flats ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT ''`,
  );
  await q(
    `ALTER TABLE flats ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`,
  );
  await q(
    `ALTER TABLE flats ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false`,
  );
  await q(
    `ALTER TABLE flats ADD COLUMN IF NOT EXISTS corp_excluded boolean NOT NULL DEFAULT false`,
  );
  const seeded = await query(`SELECT 1 FROM settings WHERE key='flats_seeded'`);
  if (
    !seeded.length &&
    /^(1|true|on|yes)$/i.test(process.env.SEED_FLATS || "")
  ) {
    await query(
      `INSERT INTO flats(flat,sl,name,type,bua,uds) SELECT flat,sl,name,type,bua,uds FROM jsonb_to_recordset($1::jsonb) AS x(flat text, sl int, name text, type text, bua float8, uds float8) ON CONFLICT DO NOTHING`,
      [JSON.stringify(seed)],
    );
    await q(
      `INSERT INTO settings(key,value) VALUES('flats_seeded','true'::jsonb) ON CONFLICT DO NOTHING`,
    );
  }
  if (previous < 8)
    await q(
      `UPDATE months SET excluded_flats = COALESCE((SELECT jsonb_agg(flat ORDER BY sl, flat) FROM flats WHERE excluded=true), '[]'::jsonb) WHERE excluded_flats = '[]'::jsonb AND EXISTS (SELECT 1 FROM flats WHERE excluded=true)`,
    );
  if (previous > 0 && previous < 10) {
    await q(
      `UPDATE flats SET excluded = COALESCE(flat IN (SELECT jsonb_array_elements_text(x) FROM (SELECT excluded_flats || excluded_expense_flats AS x FROM months ORDER BY month DESC LIMIT 1) t), false) WHERE EXISTS (SELECT 1 FROM months)`,
    );
    await q(
      `UPDATE flats SET corp_excluded = COALESCE(flat IN (SELECT jsonb_array_elements_text(x) FROM (SELECT excluded_corp_flats AS x FROM months ORDER BY month DESC LIMIT 1) t), false) WHERE EXISTS (SELECT 1 FROM months)`,
    );
    await q(
      `INSERT INTO settings(key,value) VALUES('columns','{"orgName":"My Apartment","orgShort":"MA"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb) || jsonb_build_object('orgName', COALESCE(NULLIF(settings.value->>'orgName',''),'My Apartment'), 'orgShort', COALESCE(NULLIF(settings.value->>'orgShort',''),'MA'))`,
    );
  }
  await q(
    `CREATE TABLE IF NOT EXISTS users(username text PRIMARY KEY, pass text NOT NULL, role text NOT NULL)`,
  );
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS flat text`);
  await q(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS tok_ver integer NOT NULL DEFAULT 0`,
  );
  await q(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT ''`,
  );
  await q(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`,
  );
  await q(`UPDATE users SET role='user' WHERE role IN ('owner','viewer')`);
  await q(
    `UPDATE settings SET value = value || jsonb_build_object('contactEmail', COALESCE(value->>'contactEmail','')) WHERE key='columns'`,
  );
  await q(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await q(
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','admin','developer','super','superadmin','security'))`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS audit_log(id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), username text NOT NULL DEFAULT '', action text NOT NULL, target text NOT NULL DEFAULT '', detail jsonb NOT NULL DEFAULT '{}')`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS login_attempts(key text PRIMARY KEY, fails int NOT NULL DEFAULT 0, first_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS backups(id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS corpus_ledger(id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), month text, kind text NOT NULL DEFAULT 'deposit', source text NOT NULL DEFAULT 'manual', description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0)`,
  );
  await q(
    `ALTER TABLE corpus_ledger DROP CONSTRAINT IF EXISTS corpus_ledger_kind_check`,
  );
  await q(
    `ALTER TABLE corpus_ledger ADD CONSTRAINT corpus_ledger_kind_check CHECK (kind IN ('deposit','withdrawal'))`,
  );
  await q(
    `CREATE UNIQUE INDEX IF NOT EXISTS corpus_ledger_month_end_uidx ON corpus_ledger(month) WHERE source='month_end'`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS tickets(id serial PRIMARY KEY, category text NOT NULL DEFAULT 'maintenance', title text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', flat text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), decided_by text, decided_at timestamptz, note text NOT NULL DEFAULT '')`,
  );
  await q(
    `ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_category_check`,
  );
  await q(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_category_check CHECK (category IN ('delivery','security','maintenance'))`,
  );
  await q(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await q(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('open','approved','in_progress','resolved','rejected'))`,
  );
  await q(`CREATE INDEX IF NOT EXISTS tickets_flat_idx ON tickets(flat)`);
  await q(
    `CREATE TABLE IF NOT EXISTS hall_bookings(id serial PRIMARY KEY, flat text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), decided_by text, decided_at timestamptz, note text NOT NULL DEFAULT '', booking_amount double precision NOT NULL DEFAULT 0)`,
  );
  await q(
    `ALTER TABLE hall_bookings ADD COLUMN IF NOT EXISTS booking_amount double precision NOT NULL DEFAULT 0`,
  );
  await q(
    `ALTER TABLE hall_bookings DROP CONSTRAINT IF EXISTS hall_bookings_status_check`,
  );
  await q(
    `ALTER TABLE hall_bookings ADD CONSTRAINT hall_bookings_status_check CHECK (status IN ('pending','approved','rejected','cancelled'))`,
  );
  await q(
    `CREATE INDEX IF NOT EXISTS hall_bookings_range_idx ON hall_bookings(starts_at, ends_at)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS gym_bookings(id serial PRIMARY KEY, flat text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), decided_by text, decided_at timestamptz, note text NOT NULL DEFAULT '')`,
  );
  await q(
    `ALTER TABLE gym_bookings DROP CONSTRAINT IF EXISTS gym_bookings_status_check`,
  );
  await q(
    `ALTER TABLE gym_bookings ADD CONSTRAINT gym_bookings_status_check CHECK (status IN ('pending','approved','rejected','cancelled'))`,
  );
  await q(
    `CREATE INDEX IF NOT EXISTS gym_bookings_range_idx ON gym_bookings(starts_at, ends_at)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS polls(id serial PRIMARY KEY, title text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', options jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'open', created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), closes_at timestamptz)`,
  );
  await q(`ALTER TABLE polls DROP CONSTRAINT IF EXISTS polls_status_check`);
  await q(
    `ALTER TABLE polls ADD CONSTRAINT polls_status_check CHECK (status IN ('open','closed'))`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS poll_votes(poll_id int NOT NULL REFERENCES polls(id) ON DELETE CASCADE, flat text NOT NULL, option_index int NOT NULL, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(poll_id, flat))`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS notification_logs(id serial PRIMARY KEY, sent_at timestamptz NOT NULL DEFAULT now(), sent_by text NOT NULL DEFAULT '', channel text NOT NULL DEFAULT 'email', target text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'sent')`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS contact_submissions(id serial PRIMARY KEY, name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '', submitted_by text NOT NULL DEFAULT '', submitted_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending', error text NOT NULL DEFAULT '', read_at timestamptz, read_by text NOT NULL DEFAULT '')`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS events(id serial PRIMARY KEY, title text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, created_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
  );
  await q(`CREATE INDEX IF NOT EXISTS events_start_idx ON events(starts_at)`);
  await q(
    `CREATE TABLE IF NOT EXISTS security_events(id serial PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'default', at timestamptz NOT NULL DEFAULT now(), type text NOT NULL, username text NOT NULL DEFAULT '', ip text NOT NULL DEFAULT '', detail jsonb NOT NULL DEFAULT '{}'::jsonb)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS security_access_codes(id serial PRIMARY KEY, code text NOT NULL UNIQUE, visitor_name text NOT NULL, flat text NOT NULL, phone text NOT NULL DEFAULT '', purpose text NOT NULL DEFAULT 'Visitor', status text NOT NULL DEFAULT 'pending', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, accepted_by text, accepted_at timestamptz)`,
  );
  await q(
    `ALTER TABLE security_access_codes ADD COLUMN IF NOT EXISTS visit_at timestamptz`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS visitor_photo_requests(
      id serial PRIMARY KEY,
      tenant_id text NOT NULL DEFAULT 'default',
      access_code_id integer REFERENCES security_access_codes(id) ON DELETE SET NULL,
      visitor_name text NOT NULL,
      flat text NOT NULL,
      purpose text NOT NULL DEFAULT 'Visitor',
      phone text NOT NULL DEFAULT '',
      photo_data text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_by text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_by text,
      reviewed_at timestamptz,
      review_note text NOT NULL DEFAULT ''
    )`,
  );
  await q(
    `CREATE INDEX IF NOT EXISTS visitor_photo_requests_flat_status_idx ON visitor_photo_requests(flat, status, created_at DESC)`,
  );
  await q(
    `CREATE UNIQUE INDEX IF NOT EXISTS visitor_photo_requests_access_code_uq ON visitor_photo_requests(access_code_id) WHERE access_code_id IS NOT NULL`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS parcel_notices(
      id serial PRIMARY KEY,
      tenant_id text NOT NULL DEFAULT 'default',
      flat text NOT NULL,
      courier text NOT NULL DEFAULT '',
      tracking_number text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      photo_data text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','collected')),
      created_by text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_by text,
      acknowledged_at timestamptz
    )`,
  );
  await q(
    `CREATE INDEX IF NOT EXISTS parcel_notices_flat_status_idx ON parcel_notices(flat, status, created_at DESC)`,
  );
  await q(
    `CREATE INDEX IF NOT EXISTS security_events_at_idx ON security_events(at DESC)`,
  );
  await q(
    `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default'`,
  );
  await q(
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default'`,
  );
  for (const t of [
    "months",
    "month_archive",
    "payments",
    "flats",
    "users",
    "backups",
    "corpus_ledger",
    "tickets",
    "hall_bookings",
    "gym_bookings",
    "polls",
    "poll_votes",
    "notification_logs",
    "contact_submissions",
    "events",
  ]) {
    await q(
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default'`,
    );
  }
  await q(
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text`,
  );
  await q(
    `ALTER TABLE hall_bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text`,
  );
  await q(
    `ALTER TABLE gym_bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text`,
  );
  await q(
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text`,
  );
  await q(
    `ALTER TABLE polls ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by text`,
  );
  await q(
    `INSERT INTO settings(key,value,tenant_id) VALUES('maintenance','{"enabled":false,"message":"System maintenance in progress. Please try again shortly."}'::jsonb,'default') ON CONFLICT(key) DO NOTHING`,
  );
  await q(
    `INSERT INTO settings(key,value,tenant_id) VALUES('retention','{"tickets":365,"contacts":365,"audit":730,"security":90}'::jsonb,'default') ON CONFLICT(key) DO NOTHING`,
  );

  // One-time migration: encrypt existing visitor/parcel photos and selected contact fields.
  // Reads through sql.query transparently decrypt ENC:v1 values, so this also safely
  // normalizes older plaintext rows without double-encrypting existing ciphertext.
  for (const row of await query(
    "SELECT id, courier, tracking_number, notes, photo_data FROM parcel_notices",
  )) {
    const fields = [
      "courier",
      "tracking_number",
      "notes",
      "photo_data",
    ] as const;
    for (const field of fields) {
      const value = typeof row[field] === "string" ? row[field] : "";
      if (value && !value.startsWith("ENC:v1:"))
        await query(`UPDATE parcel_notices SET ${field}=$2 WHERE id=$1`, [
          row.id,
          encryptData(value),
        ]);
    }
  }
  for (const row of await query(
    "SELECT id, visitor_name, purpose, photo_data, phone, review_note FROM visitor_photo_requests",
  )) {
    const fields = [
      "visitor_name",
      "purpose",
      "photo_data",
      "phone",
      "review_note",
    ] as const;
    for (const field of fields) {
      const value = typeof row[field] === "string" ? row[field] : "";
      if (value && !value.startsWith("ENC:v1:"))
        await query(
          `UPDATE visitor_photo_requests SET ${field}=$2 WHERE id=$1`,
          [row.id, encryptData(value)],
        );
    }
  }
  for (const row of await query(
    "SELECT id, visitor_name, phone, purpose FROM security_access_codes",
  )) {
    const fields = ["visitor_name", "phone", "purpose"] as const;
    for (const field of fields) {
      const value = typeof row[field] === "string" ? row[field] : "";
      if (value && !value.startsWith("ENC:v1:"))
        await query(
          `UPDATE security_access_codes SET ${field}=$2 WHERE id=$1`,
          [row.id, encryptData(value)],
        );
    }
  }
  for (const row of await query(
    "SELECT id, name, email, subject, message, error FROM contact_submissions",
  )) {
    const fields = ["name", "email", "subject", "message", "error"] as const;
    for (const field of fields) {
      const value = typeof row[field] === "string" ? row[field] : "";
      if (value && !value.startsWith("ENC:v1:"))
        await query(`UPDATE contact_submissions SET ${field}=$2 WHERE id=$1`, [
          row.id,
          encryptData(value),
        ]);
    }
  }
  for (const row of await query("SELECT username, phone, email FROM users")) {
    const phone = typeof row.phone === "string" ? row.phone : "";
    const email = typeof row.email === "string" ? row.email : "";
    if (phone && !phone.startsWith("ENC:v1:"))
      await query("UPDATE users SET phone=$2 WHERE username=$1", [
        row.username,
        encryptData(phone),
      ]);
    if (email && !email.startsWith("ENC:v1:"))
      await query("UPDATE users SET email=$2 WHERE username=$1", [
        row.username,
        encryptData(email),
      ]);
  }
  for (const row of await query("SELECT flat, phone, email FROM flats")) {
    const phone = typeof row.phone === "string" ? row.phone : "";
    const email = typeof row.email === "string" ? row.email : "";
    if (phone && !phone.startsWith("ENC:v1:"))
      await query("UPDATE flats SET phone=$2 WHERE flat=$1", [
        row.flat,
        encryptData(phone),
      ]);
    if (email && !email.startsWith("ENC:v1:"))
      await query("UPDATE flats SET email=$2 WHERE flat=$1", [
        row.flat,
        encryptData(email),
      ]);
  }
  // Encrypt any existing plaintext backup rows in the application-managed backup table.
  for (const row of await query("SELECT id, data FROM backups")) {
    const value = row.data;
    if (!(
      value &&
      typeof value === "object" &&
      (value as any).app === "rv-fallon-encrypted-backup" &&
      (value as any).encrypted === true
    )) {
      await query("UPDATE backups SET data=$2::jsonb WHERE id=$1", [
        row.id,
        JSON.stringify(protectBackup(value)),
      ]);
    }
  }

  if (rls)
    for (const t of APP_TABLES)
      await q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  // Rebrand only the previous built-in defaults. Preserve organization names that administrators customized.
  await query(
    `INSERT INTO settings(key,value) VALUES('columns','{"orgName":"My Apartment","orgShort":"MA"}'::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb) || jsonb_build_object(
       'orgName', CASE WHEN settings.value->>'orgName' IS NULL OR settings.value->>'orgName' IN ('RV Fallon','RV Fallon Owners Association') THEN 'My Apartment' ELSE settings.value->>'orgName' END,
       'orgShort', CASE WHEN settings.value->>'orgShort' IS NULL OR settings.value->>'orgShort'='RV' THEN 'MA' ELSE settings.value->>'orgShort' END
     )`,
  );
  await query(
    `INSERT INTO settings(key,value) VALUES('schema_version',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb`,
    [String(SCHEMA_VERSION)],
  );
}

let schemaReady: Promise<void> | undefined;
const retry =
  (reset: () => void) =>
  (e: unknown): never => {
    reset();
    throw e;
  };
export const init = async () => {
  schemaReady ||= ensureSchema().catch(retry(() => (schemaReady = undefined)));
  await schemaReady;
};
