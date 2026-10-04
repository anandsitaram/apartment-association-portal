/** Role helpers and page availability. One definition for the API, the web app and the native app. */
import type { Data, Role } from "./types.js";
import { NAV, ROLE_LABEL, type NavItem } from "./navigation.js";

export { ROLE_LABEL };

export const isAdminRole = (r?: Role | string | null): boolean =>
  r === "admin" || r === "super" || r === "superadmin";
export const isSuperRole = (r?: Role | string | null): boolean =>
  r === "super" || r === "superadmin";
/** The role as the navigation table spells it: super -> superadmin, any admin -> admin. */
export const effectiveRole = (r?: Role | string | null): string =>
  isSuperRole(r)
    ? "superadmin"
    : isAdminRole(r)
      ? "admin"
      : String(r || "public");

/** Pages this login may open, in NAV order, honouring role and feature switches.
 *  `only` limits the list to the pages a client actually implements (the native app passes its own list). */
export function availablePages(
  role: Role | string | null | undefined,
  features?: Data["features"] | null,
  only?: readonly string[],
): NavItem[] {
  const eff = effectiveRole(role);
  return NAV.filter(
    (n) =>
      (!only || only.includes(n.id)) &&
      n.roles.includes(eff) &&
      (!n.feature ||
        (features as Record<string, boolean> | null | undefined)?.[
          n.feature
        ] !== false),
  );
}
