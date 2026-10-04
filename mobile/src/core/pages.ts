// Native-only layout decisions. WHICH pages a login may open (role + feature switches) comes from
// shared/roles; this file only says which of them the native app implements and how the tab bar is laid out.
import type { Data, Role } from '../../../shared/types';
import type { NavItem } from '../../../shared/navigation';
import { availablePages as sharedAvailablePages, isAdminRole } from '../../../shared/roles';

// Pages the native app implements. Everything else in NAV stays on the web app.
export const MOBILE_PAGES = [
  'dashboard',
  'months',
  'mymaintenance',
  'tickets',
  'hall',
  'gym',
  'events',
  'polls',
  'corpus',
  'flats',
  'flat-users',
  'summary',
  'notifications',
  'audit',
  'service-contacts',
  'security-desk',
  'visitor-access',
  'contact',
  'contact-submissions',
  'settings',
  'backups',
  'users',
  'feature-config',
  'developer-accounts',
  'security',
] as const;
export type MobilePage = (typeof MOBILE_PAGES)[number];

export const availablePages = (role: Role | string | null | undefined, features?: Data['features'] | null): NavItem[] =>
  sharedAvailablePages(role, features, MOBILE_PAGES);

/** Bottom-bar tabs (max 4) + the rest under "More". */
export function splitTabs(pages: NavItem[], role: Role | string | null | undefined) {
  const preferred = isAdminRole(role) ? ['dashboard', 'months', 'tickets', 'hall'] : ['dashboard', 'mymaintenance', 'tickets', 'hall'];
  const ids = pages.map((p) => p.id);
  const tabs = preferred.filter((id) => ids.includes(id));
  for (const id of ids) if (tabs.length < 4 && !tabs.includes(id)) tabs.push(id);
  return { tabs: tabs.map((id) => pages.find((p) => p.id === id)!), more: pages.filter((p) => !tabs.includes(p.id)) };
}
