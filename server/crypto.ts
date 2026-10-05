import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "ENC:v1:";
const KDF_SALT = "myapartment-salt"; // Retained for compatibility with existing ENC:v1 records.

function deriveKey(secret: string): Buffer {
  if (!secret) throw new Error("Encryption key is not configured");
  return scryptSync(secret, KDF_SALT, 32);
}

function currentEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ENCRYPTION_SECRET must be configured with at least 32 characters",
    );
  }
  return deriveKey(secret);
}

function decryptionKeys(): Buffer[] {
  const secrets = [
    process.env.ENCRYPTION_SECRET,
    process.env.LEGACY_ENCRYPTION_SECRET,
  ].filter((value): value is string => Boolean(value));
  const unique = [...new Set(secrets)];
  if (!unique.length) throw new Error("No encryption key is configured");
  return unique.map(deriveKey);
}

export function encryptData(text: string): string {
  if (!text) return text;
  // Existing ciphertext must not be encrypted again; it will be decrypted with
  // either the current key or the explicitly configured legacy key.
  if (text.startsWith(PREFIX)) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, currentEncryptionKey(), iv);
  const encrypted = cipher.update(text, "utf8", "hex") + cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${PREFIX}${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptData(text: string): string {
  if (!text || typeof text !== "string" || !text.startsWith(PREFIX))
    return text;
  const parts = text.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");
  const [ivHex, tagHex, encryptedHex] = parts;
  if (
    !/^[0-9a-f]+$/i.test(ivHex) ||
    ivHex.length !== 24 ||
    !/^[0-9a-f]+$/i.test(tagHex) ||
    tagHex.length !== 32 ||
    (encryptedHex && !/^[0-9a-f]+$/i.test(encryptedHex))
  ) {
    throw new Error("Malformed encrypted value");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  let lastError: unknown;
  for (const key of decryptionKeys()) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return (
        decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8")
      );
    } catch (error) {
      lastError = error;
    }
  }
  // Never return ciphertext as if it were valid plaintext. This intentionally
  // fails the request rather than silently corrupting data or masking a bad key.
  throw new Error(
    "Unable to decrypt protected data; verify ENCRYPTION_SECRET and LEGACY_ENCRYPTION_SECRET",
    { cause: lastError },
  );
}

export function encryptObject<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  return encryptData(JSON.stringify(obj)) as unknown as T;
}

export function decryptObject<T>(val: unknown): T {
  if (typeof val === "string" && val.startsWith(PREFIX)) {
    const decryptedStr = decryptData(val);
    try {
      return JSON.parse(decryptedStr) as T;
    } catch {
      return decryptedStr as unknown as T;
    }
  }
  return val as T;
}
