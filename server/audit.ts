import { AUDIT_LOG } from "./flags.js";
import { sql } from "./db.js";
import type { Actor } from "./types";

// Never blocks or fails the action being recorded.
export async function audit(
  me: Actor | null | undefined,
  action: string,
  target?: unknown,
  detail?: unknown,
) {
  if (!AUDIT_LOG()) return;
  try {
    await sql.query(
      "INSERT INTO audit_log(tenant_id, username, action, target, detail) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        "default",
        me?.username || "?",
        action,
        String(target ?? ""),
        JSON.stringify(detail ?? {}),
      ],
    );
  } catch (e) {
    console.error("audit log failed", e);
  }
}

// Who changed one flat's payment for one month, newest first (Super Admin activity stays hidden from Admins)
export const paymentHistory = (
  month: string,
  flat: string,
  viewerRole: string = "super",
) => {
  const target = `${month} ${flat}`;
  if (viewerRole === "super" || viewerRole === "superadmin") {
    return sql.query(
      "SELECT id, at, username, detail FROM audit_log WHERE action='savePayment' AND target=$1 ORDER BY id DESC LIMIT 30",
      [target],
    );
  }
  return sql.query(
    `SELECT id, at, username, detail FROM audit_log
      WHERE action='savePayment' AND target=$1
        AND username NOT IN (SELECT username FROM users WHERE role IN ('super','superadmin'))
      ORDER BY id DESC LIMIT 30`,
    [target],
  );
};

export const listAudit = (
  limit: number | string = 200,
  viewerRole: string = "super",
) => {
  const n = Math.min(Math.max(+limit || 200, 1), 500);
  if (viewerRole === "super" || viewerRole === "superadmin") {
    return sql.query(
      "SELECT id, at, username, action, target, detail FROM audit_log ORDER BY id DESC LIMIT $1",
      [n],
    );
  }
  // Admins can review normal-user and Admin activity, but Super Admin activity
  // is intentionally confidential to Super Admins.
  return sql.query(
    `SELECT id, at, username, action, target, detail
       FROM audit_log
      WHERE username NOT IN (SELECT username FROM users WHERE role IN ('super','superadmin'))
      ORDER BY id DESC LIMIT $1`,
    [n],
  );
};
