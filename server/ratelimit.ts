import { sql } from "./db.js";
import { fail } from "./http.js";
import type { Req } from "./types";

export interface LimitKey {
  key: string;
  max: number;
}

// Login throttling (LOGIN_RATE_LIMIT): 5 wrong passwords per user+IP or 20 per IP inside 15 minutes lock that key for 15 minutes.
const WINDOW = "15 minutes";
export const LIMITS = { pair: 5, ip: 20 };

export const clientIp = (req: Req) =>
  String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "?")
    .split(",")[0]
    .trim();

export const loginKeys = (username: string, ip: string): LimitKey[] => [
  { key: `u:${username}|${ip}`, max: LIMITS.pair },
  { key: `ip:${ip}`, max: LIMITS.ip },
];

// throws 429 when any of the keys is currently locked
export async function guard(keys: LimitKey[]) {
  if (!keys.length) return;
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(",");
  const rows = await sql.query(
    `SELECT extract(epoch FROM (locked_until - now()))::int AS wait FROM login_attempts WHERE key IN (${placeholders}) AND locked_until > now() ORDER BY locked_until DESC`,
    keys.map((key) => key.key),
  );
  if (rows.length)
    fail(
      429,
      `Too many wrong attempts. Try again in ${Math.max(1, Math.ceil(rows[0].wait / 60))} minute(s).`,
    );
}

export async function recordFail(keys: LimitKey[]) {
  for (const { key, max } of keys) {
    const [r] = await sql.query(
      `INSERT INTO login_attempts(key, fails, first_at) VALUES($1, 1, now())
       ON CONFLICT(key) DO UPDATE SET
         fails = CASE WHEN login_attempts.first_at < now() - interval '${WINDOW}' THEN 1 ELSE login_attempts.fails + 1 END,
         first_at = CASE WHEN login_attempts.first_at < now() - interval '${WINDOW}' THEN now() ELSE login_attempts.first_at END
       RETURNING fails`,
      [key],
    );
    if (r.fails >= max)
      await sql.query(
        `UPDATE login_attempts SET locked_until = now() + interval '${WINDOW}' WHERE key=$1`,
        [key],
      );
  }
}

// a good login clears the user+IP counter (never the IP-wide one)
export const clearFails = (keys: LimitKey[]) =>
  sql.query("DELETE FROM login_attempts WHERE key=$1", [keys[0].key]);

// Public contact form throttling: at most five submissions per IP per 15-minute window.
export const contactKeys = (ip: string): LimitKey[] => [
  { key: `contact:${ip}`, max: 5 },
];
