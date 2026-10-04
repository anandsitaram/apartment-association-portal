import { afterEach, describe, expect, it } from "vitest";
import { adminPasswordVersion, read, sign } from "../server/auth.js";

const originalPassword = process.env.ADMIN_PASSWORD;

afterEach(() => {
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
});

describe("authentication key separation", () => {
  it("signs and reads a token using AUTH_SECRET", () => {
    const token = sign({ u: "resident", exp: Date.now() + 60_000 });
    expect(read(token)?.u).toBe("resident");
  });

  it("changes the built-in admin password version when the password changes", () => {
    process.env.ADMIN_PASSWORD = "first-password";
    const first = adminPasswordVersion();
    process.env.ADMIN_PASSWORD = "second-password";
    expect(adminPasswordVersion()).not.toBe(first);
  });

  it("does not fall back to ADMIN_PASSWORD when AUTH_SECRET is missing", () => {
    const authSecret = process.env.AUTH_SECRET;
    process.env.ADMIN_PASSWORD = "some-admin-password";
    delete process.env.AUTH_SECRET;
    try {
      expect(() => sign({ u: "test", exp: Date.now() + 60_000 })).toThrow(
        /AUTH_SECRET/,
      );
    } finally {
      process.env.AUTH_SECRET = authSecret;
    }
  });
});
