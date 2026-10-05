import type { Role } from '../../../shared/types';
import { secureGetItem, secureRemoveItem, secureSetItem } from './secureStorage';

export interface Auth {
  token: string;
  user: { name: string; role: Role; flat?: string | null };
}
const AUTH_KEY = 'rv_auth';
const SERVER_KEY = 'my_apartment_server';
const MONTH_KEY = 'rv_selected_month';

export const readSession = () => secureGetItem<Auth | null>(AUTH_KEY, null);
export const writeSession = (a: Auth) => secureSetItem(AUTH_KEY, a);
export const clearSession = () => secureRemoveItem(AUTH_KEY);
export const readServer = () => secureGetItem<string>(SERVER_KEY, '');
export const writeServer = (v: string) => secureSetItem(SERVER_KEY, v);
export const readMonth = () => secureGetItem<string>(MONTH_KEY, '');
export const writeMonth = (v: string) => secureSetItem(MONTH_KEY, v);
