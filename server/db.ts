import seed from "./flats-seed.js";
import { dump } from "./backup.js";
import type { Query, Row } from "./types";
import { decryptData } from "./crypto.js";

export const SCHEMA_VERSION = 20;
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
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
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
        JSON.stringify(data),
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
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS rounding text DEFAULT 'none'`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rate double precision DEFAULT 0.5`,
  );
  await q(
    `ALTER TABLE months ADD COLUMN IF NOT EXISTS corp_rounding text DEFAULT 'nearest'`,
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
  await q(
    `CREATE TABLE IF NOT EXISTS month_archive(month text PRIMARY KEY, data jsonb NOT NULL, deleted_at timestamptz DEFAULT now())`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS payments(month text, flat text, maint double precision DEFAULT 0, corp double precision DEFAULT 0, mode text DEFAULT '', paid_date text DEFAULT '', PRIMARY KEY(month, flat))`,
  );
  await q(
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS extra jsonb DEFAULT '{}'`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS settings(key text PRIMARY KEY, value jsonb)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS flats(flat text PRIMARY KEY, sl int NOT NULL DEFAULT 0, name text NOT NULL DEFAULT '', type text NOT NULL DEFAULT '', bua double precision NOT NULL DEFAULT 0, uds double precision NOT NULL DEFAULT 0)`,
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
      `INSERT INTO flats(flat,sl,name,type,bua,uds,block) SELECT flat,sl,name,type,bua,uds,block FROM jsonb_to_recordset($1::jsonb) AS x(flat text, sl int, name text, type text, bua float8, uds float8, block text) ON CONFLICT DO NOTHING`,
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
      `INSERT INTO settings(key,value) VALUES('columns','{"orgName":"Cedar Grove Residences","orgShort":"CG"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb) || jsonb_build_object('orgName', COALESCE(NULLIF(settings.value->>'orgName',''),'Cedar Grove Residences'), 'orgShort', COALESCE(NULLIF(settings.value->>'orgShort',''),'CG'))`,
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
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','admin','developer','super','superadmin'))`,
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

  if (rls)
    for (const t of APP_TABLES)
      await q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
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
