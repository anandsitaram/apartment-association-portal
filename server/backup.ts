// Backup = every table that holds real data as plain JSON. Used by the API (download / daily job) and scripts/db-tool.js.
export const DATA_TABLES = [
  "flats",
  "months",
  "payments",
  "settings",
  "month_archive",
  "corpus_ledger",
  "tickets",
  "hall_bookings",
  "gym_bookings",
  "polls",
  "poll_votes",
  "notification_logs",
  "contact_submissions",
  "events",
];
const WITH_USERS = [...DATA_TABLES, "users"];
const COL = /^[a-z_][a-z0-9_]*$/;

// query: (text) => Promise<rows>. Users (password hashes) are only included on request.
export interface BackupFile {
  app: string;
  version: number;
  at: string;
  tables: Record<string, Record<string, unknown>[]>;
}
export async function dump(
  query: (text: string) => Promise<Record<string, unknown>[]>,
  { users = false }: { users?: boolean } = {},
): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  for (const t of users ? WITH_USERS : DATA_TABLES)
    tables[t] = await query(
      t === "settings"
        ? "SELECT * FROM settings WHERE key <> 'schema_version' ORDER BY key"
        : `SELECT * FROM ${t}`,
    );
  return {
    app: "community-portal",
    version: 1,
    at: new Date().toISOString(),
    tables,
  };
}

// Replace the contents of the backed-up tables with `data`, all-or-nothing. `c` is a connected node-postgres client.
export async function restore(
  c: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  data: BackupFile,
) {
  if (data?.app !== "community-portal" || typeof data.tables !== "object")
    throw new Error("This is not a valid Community Portal backup file");
  await c.query("BEGIN");
  try {
    for (const [t, rows] of Object.entries(data.tables)) {
      if (!WITH_USERS.includes(t))
        throw new Error(`Unexpected table ${t} in backup`);
      await c.query(
        t === "settings"
          ? "DELETE FROM settings WHERE key <> 'schema_version'"
          : `DELETE FROM ${t}`,
      );
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      if (!cols.every((k) => COL.test(k)))
        throw new Error(`Bad column name in ${t}`);
      // columns missing from an older backup fall back to their defaults
      await c.query(
        `INSERT INTO ${t}(${cols.join(",")}) SELECT ${cols.join(",")} FROM jsonb_populate_recordset(null::${t}, $1::jsonb)`,
        [JSON.stringify(rows)],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}
