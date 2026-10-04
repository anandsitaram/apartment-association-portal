import type { ActionBody } from "../shared/types";
import { createApiClient } from "../shared/api-client.js";

export { ApiError, errText, isAuthError } from "../shared/api-client.js";

// `save` as the screens see it: send an action, reload the data, resolve true when it worked
export type Save = (body: ActionBody) => Promise<boolean>;

// The web app is served by the same deployment as the API, so the base URL is the current origin.
export const { call } = createApiClient({ getBaseUrl: () => "" });
