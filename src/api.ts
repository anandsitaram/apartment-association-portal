import type { ActionBody } from "../shared/types";

// `save` as the screens see it: send an action, reload the data, resolve true when it worked
export type Save = (body: ActionBody) => Promise<boolean>;

// An API error: `authRequired` is set when the server wants a login
export class ApiError extends Error {
  authRequired?: boolean;
}
export const errText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
export const isAuthError = (e: unknown): boolean =>
  (e as ApiError)?.authRequired === true || /Login required/.test(errText(e));

// Single API endpoint helper.
export async function call<T = any>(
  body?: Record<string, unknown> | null,
  token?: string | null,
  screen?: string,
  month?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    body ? 30000 : 20000,
  );
  let r: Response;
  try {
    r = await fetch("/api/app", {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: "Bearer " + token }),
        ...(screen && { "X-RV-Screen": screen }),
        ...(month && { "X-RV-Month": month }),
      },
      body: body && JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError")
      throw new Error(
        "The request took too long. Please check your connection and retry.",
      );
    throw e;
  } finally {
    window.clearTimeout(timeout);
  }
  const t = await r.text();
  let j: any;
  try {
    j = JSON.parse(t);
  } catch {
    throw new Error(
      `API error (HTTP ${r.status}). Check DATABASE_URL / ADMIN_PASSWORD, then run: npm run dev`,
    );
  }
  if (!r.ok)
    throw Object.assign(new ApiError(j.error), {
      authRequired: j.authRequired,
    });
  return j;
}
