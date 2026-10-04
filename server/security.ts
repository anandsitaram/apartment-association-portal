import { sql } from "./db.js";
import type { Actor } from "./types";

export async function securityEvent(
  type: string,
  username: string,
  ip: string,
  detail: Record<string, unknown> = {},
) {
  try {
    await sql.query(
      "INSERT INTO security_events(tenant_id,type,username,ip,detail) VALUES('default',$1,$2,$3,$4::jsonb)",
      [type, username, ip, JSON.stringify(detail)],
    );
  } catch (e) {
    console.error("security event failed", e);
  }
}

export async function revokeSessions(username: string) {
  await sql.query("UPDATE users SET tok_ver=tok_ver+1 WHERE username=$1", [
    username,
  ]);
}

export async function maintenanceFor(role: string) {
  if (role !== "user") return false;
  const [r] = await sql.query(
    "SELECT value FROM settings WHERE key='maintenance' LIMIT 1",
  );
  return r?.value?.enabled === true;
}
