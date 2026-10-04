import { describe, expect, it } from "vitest";
import { canAccessRole, roleDenialMessage } from "../server/permissions.js";

describe("central API role policy", () => {
  it("denies missing roles and grants no implicit access", () => {
    expect(canAccessRole(null, "user")).toBe(false);
    expect(canAccessRole(undefined, "admin")).toBe(false);
  });

  it("allows residents but excludes security from general user actions", () => {
    expect(canAccessRole("user", "user")).toBe(true);
    expect(canAccessRole("admin", "user")).toBe(true);
    expect(canAccessRole("security", "user")).toBe(false);
  });

  it("limits security-only actions to the security role", () => {
    expect(canAccessRole("security", "security")).toBe(true);
    expect(canAccessRole("user", "security")).toBe(false);
    expect(canAccessRole("admin", "security")).toBe(false);
  });

  it("preserves admin, developer, and superadmin access rules", () => {
    expect(canAccessRole("admin", "admin")).toBe(true);
    expect(canAccessRole("user", "admin")).toBe(false);
    expect(canAccessRole("developer", "developer")).toBe(true);
    expect(canAccessRole("admin", "developer")).toBe(false);
    expect(canAccessRole("super", "admin")).toBe(true);
    expect(canAccessRole("superadmin", "developer")).toBe(true);
    expect(canAccessRole("super", "superadmin")).toBe(true);
  });

  it("uses consistent denial messages", () => {
    expect(roleDenialMessage("superadmin")).toBe(
      "Only a Super Admin can do this",
    );
    expect(roleDenialMessage("developer")).toBe(
      "Only a Developer or Super Admin can do this",
    );
    expect(roleDenialMessage("admin")).toBe("Not allowed for your role");
  });
});
