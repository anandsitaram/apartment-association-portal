import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { SECRET } from "./auth.js";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "ENC:v1:";

function getEncryptionKey(): Buffer {
  const secret = SECRET() || "default-rvfallon-encryption-key-32b";
  return scryptSync(secret, "rvfallon-salt", 32);
}

export function encryptData(text: string): string {
  if (!text || text.startsWith(PREFIX)) return text;
  try {
    const iv = randomBytes(12);
    const key = getEncryptionKey();
    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `${PREFIX}${iv.toString("hex")}:${tag}:${encrypted}`;
  } catch (e) {
    return text;
  }
}

export function decryptData(text: string): string {
  if (!text || typeof text !== "string" || !text.startsWith(PREFIX))
    return text;
  try {
    const payload = text.slice(PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 3) return text;
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return text;
  }
}

export function encryptObject<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const json = JSON.stringify(obj);
  return encryptData(json) as unknown as T;
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
