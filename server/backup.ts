import { encryptData, decryptData } from "./crypto.js";
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
  // Visitor and parcel records are included only inside an encrypted backup envelope.
  "security_access_codes",
  "visitor_photo_requests",
  "parcel_notices",
];
const WITH_USERS = [...DATA_TABLES, "users"];
const COL = /^[a-z_][a-z0-9_]*$/;
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  users: ["phone", "email"],
  flats: ["phone", "email"],
  contact_submissions: ["name", "email", "subject", "message", "error"],
  security_access_codes: ["visitor_name", "phone", "purpose"],
  visitor_photo_requests: [
    "visitor_name",
    "purpose",
    "phone",
    "photo_data",
    "review_note",
  ],
  parcel_notices: ["courier", "tracking_number", "notes", "photo_data"],
};
const encryptRowsForStorage = (
  table: string,
  rows: Record<string, unknown>[],
) =>
  rows.map((row) => {
    const next = { ...row };
    for (const field of ENCRYPTED_FIELDS[table] || []) {
      const value = next[field];
      if (typeof value === "string" && value) next[field] = encryptData(value);
    }
    return next;
  });

// query: (text) => Promise<rows>. Users (password hashes) are only included on request.

export interface EncryptedBackupEnvelope {
  app: "rv-fallon-encrypted-backup";
  version: 1;
  at: string;
  encrypted: true;
  payload: string;
}

export function protectBackup(data: unknown): EncryptedBackupEnvelope {
  const at =
    data &&
    typeof data === "object" &&
    "at" in data &&
    typeof (data as any).at === "string"
      ? String((data as any).at)
      : new Date().toISOString();
  if (
    data &&
    typeof data === "object" &&
    (data as any).app === "rv-fallon-encrypted-backup" &&
    (data as any).encrypted === true &&
    typeof (data as any).payload === "string"
  ) {
    return data as EncryptedBackupEnvelope;
  }
  return {
    app: "rv-fallon-encrypted-backup",
    version: 1,
    at,
    encrypted: true,
    payload: encryptData(JSON.stringify(data)),
  };
}

export function unprotectBackup(data: unknown): BackupFile {
  if (
    data &&
    typeof data === "object" &&
    (data as any).app === "rv-fallon-encrypted-backup" &&
    (data as any).encrypted === true
  ) {
    const payload = (data as any).payload;
    if (typeof payload !== "string")
      throw new Error("Encrypted backup payload is missing");
    const parsed = JSON.parse(decryptData(payload));
    if (parsed?.app !== "rv-fallon" || typeof parsed?.tables !== "object")
      throw new Error("Decrypted backup format is invalid");
    return parsed as BackupFile;
  }
  // Backward compatibility: old plaintext backups can still be restored by a Super Admin.
  return data as BackupFile;
}

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
  return { app: "rv-fallon", version: 1, at: new Date().toISOString(), tables };
}

// Replace the contents of the backed-up tables with `data`, all-or-nothing. `c` is a connected node-postgres client.
export async function restore(
  c: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  data: BackupFile,
) {
  if (data?.app !== "rv-fallon" || typeof data.tables !== "object")
    throw new Error("This is not a valid application backup file");
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
      const storedRows = encryptRowsForStorage(t, rows);
      const cols = Object.keys(storedRows[0]);
      if (!cols.every((k) => COL.test(k)))
        throw new Error(`Bad column name in ${t}`);
      // columns missing from an older backup fall back to their defaults
      await c.query(
        `INSERT INTO ${t}(${cols.join(",")}) SELECT ${cols.join(",")} FROM jsonb_populate_recordset(null::${t}, $1::jsonb)`,
        [JSON.stringify(storedRows)],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}
