import {
  createHmac,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const MIN_SECRET_LENGTH = 32;

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be configured with at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return value;
}

/** Authentication signing key. It must never fall back to an account password. */
export const SECRET = () => requiredSecret("AUTH_SECRET");

/** Fail closed before handling requests if key separation has not been configured. */
export function assertSecuritySecrets(): void {
  requiredSecret("AUTH_SECRET");
  requiredSecret("ENCRYPTION_SECRET");
  // LEGACY_ENCRYPTION_SECRET is needed only to read data encrypted with a
  // previous key. Fresh installations must not fail every API request merely
  // because they have no legacy ciphertext. Decryption fails closed if legacy
  // ciphertext is encountered without its key.
}

export const hash = (pw: string, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
export const verify = (pw: string, stored?: string | null) => {
  const [salt = "", h] = (stored || "").split(":");
  if (!h) return false;
  const a = Buffer.from(h, "hex"),
    b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
};

// Constant-time comparison for the built-in Super Admin password.
export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  const len = Math.max(x.length, y.length, 1);
  const px = Buffer.concat([x, Buffer.alloc(len - x.length)]);
  const py = Buffer.concat([y, Buffer.alloc(len - y.length)]);
  return x.length === y.length && timingSafeEqual(px, py);
};

export const mac = (body: string) =>
  createHmac("sha256", SECRET()).update(body).digest("base64url");

/** Opaque, keyed fingerprint used to invalidate built-in Super Admin tokens
 * when ADMIN_PASSWORD changes without exposing a password hash in the token. */
export function adminPasswordVersion(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD must be configured");
  return createHmac("sha256", SECRET())
    .update(`super-admin-password-version:${password}`)
    .digest("base64url");
}
export const sign = (p: object) => {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return body + "." + mac(body);
};
export interface TokenPayload {
  u: string;
  v?: number;
  m?: "a";
  sid?: string;
  apv?: string;
  exp: number;
}
export const read = (tok?: string | null): TokenPayload | null => {
  const [body, sig] = (tok || "").split(".");
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = mac(body);
  } catch {
    return null;
  }
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
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
