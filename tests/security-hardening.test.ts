import { afterEach, describe, expect, it } from "vitest";
import { assertSecuritySecrets } from "../server/auth.js";

const authSecret = process.env.AUTH_SECRET;
const encryptionSecret = process.env.ENCRYPTION_SECRET;
const legacySecret = process.env.LEGACY_ENCRYPTION_SECRET;

afterEach(() => {
  process.env.AUTH_SECRET = authSecret;
  process.env.ENCRYPTION_SECRET = encryptionSecret;
  process.env.LEGACY_ENCRYPTION_SECRET = legacySecret;
});

describe("security configuration", () => {
  it("allows fresh installs to start without a legacy encryption key", () => {
    process.env.AUTH_SECRET =
      "test-auth-secret-0123456789-0123456789-0123456789";
    process.env.ENCRYPTION_SECRET =
      "test-encryption-secret-0123456789-0123456789";
    delete process.env.LEGACY_ENCRYPTION_SECRET;
    expect(() => assertSecuritySecrets()).not.toThrow();
  });
});
