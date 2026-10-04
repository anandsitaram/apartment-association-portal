import type { ActionBody } from '../../../shared/types';
import { createApiClient } from '../../../shared/api-client';
import { DEFAULT_API_BASE_URL } from './config';

export { ApiError, errText, isAuthError } from '../../../shared/api-client';

// `save` as the screens see it: send an action, refresh the data, resolve true when it worked
export type Save = (body: ActionBody, okMessage?: string) => Promise<boolean>;

let apiBase = DEFAULT_API_BASE_URL;
export const normalizeBaseUrl = (v: string) =>
  v
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/app$/, '');
export const setApiBase = (v: string) => {
  apiBase = normalizeBaseUrl(v) || DEFAULT_API_BASE_URL;
};
export const getApiBase = () => apiBase;
export const isValidBaseUrl = (v: string) => /^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(normalizeBaseUrl(v));

/** The same client as the web app; only the server address differs (it is configurable on the login screen). */
export const { call } = createApiClient({ getBaseUrl: () => apiBase });
