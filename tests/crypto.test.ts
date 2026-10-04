import { afterEach, describe, expect, it } from "vitest";
import { decryptData, encryptData } from "../server/crypto.js";

const current = process.env.ENCRYPTION_SECRET;
const legacy = process.env.LEGACY_ENCRYPTION_SECRET;

describe("field encryption", () => {
  afterEach(() => {
    process.env.ENCRYPTION_SECRET = current;
    process.env.LEGACY_ENCRYPTION_SECRET = legacy;
  });

  it("round-trips new encrypted values", () => {
    const encrypted = encryptData("resident@example.com");
    expect(encrypted).toMatch(/^ENC:v1:/);
    expect(decryptData(encrypted)).toBe("resident@example.com");
  });

  it("decrypts values created with the legacy key", () => {
    const plain = "legacy resident phone";
    const encrypted = encryptData(plain);
    process.env.LEGACY_ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET =
      "another-encryption-key-0123456789-0123456789";
    expect(decryptData(encrypted)).toBe(plain);
  });

  it("throws instead of returning ciphertext when keys are wrong", () => {
    const encrypted = encryptData("sensitive");
    process.env.ENCRYPTION_SECRET =
      "wrong-encryption-key-0123456789-0123456789";
    process.env.LEGACY_ENCRYPTION_SECRET =
      "wrong-legacy-key-0123456789-0123456789";
    expect(() => decryptData(encrypted)).toThrow(
      /Unable to decrypt protected data/,
    );
  });

  it("refuses to encrypt when the new encryption key is missing", () => {
    process.env.ENCRYPTION_SECRET = "";
    expect(() => encryptData("sensitive")).toThrow(/ENCRYPTION_SECRET/);
  });
});
