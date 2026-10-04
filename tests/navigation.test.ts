import { describe, expect, it } from "vitest";
import {
  EXPORTABLE,
  NAV,
  NEEDS_SCREEN_DATA,
  ROLE_LABEL,
} from "../shared/navigation";

describe("application navigation metadata", () => {
  it("uses unique section identifiers", () => {
    const ids = NAV.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines a label, icon, and role list for every navigation item", () => {
    for (const item of NAV) {
      expect(item.label.trim()).not.toBe("");
      expect(item.icon.trim()).not.toBe("");
      expect(item.roles.length).toBeGreaterThan(0);
    }
  });

  it("keeps sensitive sections restricted to admin or super-admin roles", () => {
    for (const id of ["corpus", "backups", "users", "security"]) {
      const item = NAV.find((entry) => entry.id === id);
      expect(item, `missing navigation entry: ${id}`).toBeDefined();
      expect(item!.roles).not.toContain("user");
    }
  });

  it("has labels for supported roles and only exports known page sections", () => {
    expect(ROLE_LABEL.user).toBe("Resident");
    expect(ROLE_LABEL.security).toBe("Security Desk");
    expect(EXPORTABLE.has("dashboard")).toBe(true);
    expect(EXPORTABLE.has("months")).toBe(true);
    expect(EXPORTABLE.has("unknown-section")).toBe(false);
    expect(NEEDS_SCREEN_DATA.has("hall")).toBe(true);
  });
});
