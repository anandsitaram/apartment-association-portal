import { readBrowserStorage, removeBrowserStorage } from "./safe-storage.js";

const AUTH_KEY = "rv_auth";

/**
 * Keep the bearer token only for the current browser tab/session. This reduces
 * persistence on shared devices; it is not a substitute for an HttpOnly cookie
 * and does not protect against script execution in the page. Storage may be
 * blocked by privacy settings or sandboxed documents, so every operation is
 * best-effort and must never prevent the in-memory login flow from working.
 */
export async function readSession(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const active = window.sessionStorage.getItem(AUTH_KEY);
    if (active) return active;
  } catch {
    // Storage access can throw SecurityError in restricted browsing contexts.
  }

  // One-time migration from the previous persistent token location. This is
  // only possible when browser storage is available; failures remain fail-closed.
  const legacy = readBrowserStorage(AUTH_KEY);
  if (!legacy) return null;
  try {
    window.sessionStorage.setItem(AUTH_KEY, legacy);
    removeBrowserStorage(AUTH_KEY);
    return legacy;
  } catch {
    return null;
  }
}

export async function writeSession(value: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_KEY, value);
  } catch {
    // The active React session remains authenticated in memory until reload.
  }
}

export async function clearSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // Continue clearing any legacy copy even if sessionStorage is blocked.
  }
  removeBrowserStorage(AUTH_KEY);
}
