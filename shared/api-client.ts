/**
 * The one HTTP client for /api/app (GET = data snapshot, POST = action). The web app and the native app
 * both build their `call` from this, so timeouts, headers and error handling cannot drift apart.
 */
export class ApiError extends Error {
  authRequired?: boolean;
  status?: number;
}
export const errText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
export const isAuthError = (e: unknown): boolean =>
  (e as ApiError)?.authRequired === true || /Login required/.test(errText(e));

export const READ_TIMEOUT_MS = 20000;
export const WRITE_TIMEOUT_MS = 30000;

export interface ApiClientOptions {
  /** Origin of the deployment, without a trailing slash. "" = same origin (the web app). */
  getBaseUrl: () => string;
}

export function createApiClient({ getBaseUrl }: ApiClientOptions) {
  async function call<T = any>(
    body?: Record<string, unknown> | null,
    token?: string | null,
    screen?: string,
    month?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      body ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS,
    );
    let r: Response;
    try {
      r = await fetch(`${getBaseUrl()}/api/app`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(screen ? { "X-RV-Screen": screen } : {}),
          ...(month ? { "X-RV-Month": month } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError")
        throw new Error(
          "The request took too long. Please check your connection and retry.",
        );
      throw new Error(
        "Could not reach the server. Check your internet connection.",
      );
    } finally {
      clearTimeout(timer);
    }
    const text = await r.text();
    let j: any;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected server response (HTTP ${r.status}).`);
    }
    if (!r.ok)
      throw Object.assign(new ApiError(j.error || `HTTP ${r.status}`), {
        authRequired: j.authRequired || r.status === 401,
        status: r.status,
      });
    return j;
  }
  return { call };
}
