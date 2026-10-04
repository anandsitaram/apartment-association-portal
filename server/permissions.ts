import type { Role } from "../shared/types";
import type { Action } from "./types";

/**
 * Centralized API role policy. Keep legacy `super` support here so the rest of
 * the application can migrate to the canonical `superadmin` role gradually.
 * Unknown or missing roles are denied by default.
 */
export function canAccessRole(
  actorRole: Role | null | undefined,
  requiredRole: Action["role"] | undefined,
): boolean {
  if (!actorRole) return false;
  const required = requiredRole || "admin";

  switch (required) {
    case "security":
      return actorRole === "security";
    case "user":
      return actorRole !== "security";
    case "admin":
      return actorRole === "admin" || isSuperAdmin(actorRole);
    case "developer":
      return actorRole === "developer" || isSuperAdmin(actorRole);
    case "super":
    case "superadmin":
      return isSuperAdmin(actorRole);
    default:
      return false;
  }
}

export function roleDenialMessage(
  requiredRole: Action["role"] | undefined,
): string {
  switch (requiredRole || "admin") {
    case "super":
    case "superadmin":
      return "Only a Super Admin can do this";
    case "developer":
      return "Only a Developer or Super Admin can do this";
    case "admin":
      return "Not allowed for your role";
    default:
      return "Login required";
  }
}

function isSuperAdmin(role: Role): boolean {
  return role === "super" || role === "superadmin";
}
