import {
  createHmac,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SECRET = () =>
  process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";
export const hash = (pw: string, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
export const verify = (pw: string, stored?: string | null) => {
  const [salt = "", h] = (stored || "").split(":");
  if (!h) return false;
  const a = Buffer.from(h, "hex"),
    b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
};
// constant-time string compare (for the hardcoded ADMIN_PASSWORD login, which has no stored hash to scrypt against)
export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  // pad to equal length first so the comparison itself never branches on length, only timingSafeEqual does
  const len = Math.max(x.length, y.length, 1);
  const px = Buffer.concat([x, Buffer.alloc(len - x.length)]);
  const py = Buffer.concat([y, Buffer.alloc(len - y.length)]);
  return x.length === y.length && timingSafeEqual(px, py);
};

export const mac = (body: string) =>
  createHmac("sha256", SECRET()).update(body).digest("base64url");
export const sign = (p: object) => {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return body + "." + mac(body);
};
export interface TokenPayload {
  u: string; // username
  v?: number; // the user's tok_ver at the time this token was issued
  m?: "a"; // the built-in admin login
  sid?: string;
  exp: number; // expiry, ms since epoch
}
export const read = (tok?: string | null): TokenPayload | null => {
  const [body, sig] = (tok || "").split(".");
  if (
    !body ||
    !sig ||
    !SECRET() ||
    sig.length !== mac(body).length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(mac(body)))
  )
    return null;
  try {
    const p = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as TokenPayload;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
};
