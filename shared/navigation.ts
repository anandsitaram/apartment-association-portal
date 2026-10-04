/** Shared navigation metadata and role labels for the application shell. */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  roles: string[];
  feature?: string;
}
export const ROLE_LABEL: Record<string, string> = {
  user: "Resident",
  admin: "Admin",
  super: "Super Admin",
  superadmin: "Super Admin",
  developer: "Developer",
  security: "Security Desk",
};

// pages the top-bar "Export Excel" button knows how to export
export const EXPORTABLE = new Set([
  "dashboard",
  "months",
  "flats",
  "summary",
  "corpus",
  "hall",
  "gym",
  "tickets",
  "polls",
  "notifications",
  "settings",
  "users",
  "audit",
  "mymaintenance",
  "backups",
]);
// pages whose data comes with the main request: show a loader (not an empty page) until it arrives
export const NEEDS_SCREEN_DATA = new Set([
  "corpus",
  "tickets",
  "hall",
  "gym",
  "events",
  "polls",
  "notifications",
]);

export const NAV: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    roles: ["user", "admin", "super", "superadmin"],
  },
  {
    id: "months",
    label: "Months",
    icon: "calendar",
    roles: ["user", "admin", "super", "superadmin"],
  },
  {
    id: "corpus",
    label: "Corpus Fund",
    icon: "corpus",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "mymaintenance",
    label: "My Maintenance",
    icon: "mymaintenance",
    roles: ["user"],
  },
  {
    id: "tickets",
    label: "Tickets",
    icon: "tickets",
    roles: ["user", "admin", "super", "superadmin"],
    feature: "tickets",
  },
  {
    id: "hall",
    label: "Party Hall",
    icon: "hall",
    roles: ["user", "admin", "super", "superadmin"],
    feature: "hallBooking",
  },
  {
    id: "gym",
    label: "Gym Booking",
    icon: "gym",
    roles: ["user", "admin", "super", "superadmin"],
    feature: "gymBooking",
  },
  {
    id: "events",
    label: "Events",
    icon: "calendar",
    roles: ["user", "admin", "super", "superadmin"],
    feature: "events",
  },
  {
    id: "polls",
    label: "Canvas / Polls",
    icon: "polls",
    roles: ["user", "admin", "super", "superadmin"],
    feature: "polls",
  },
  {
    id: "flats",
    label: "Flats",
    icon: "flats",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "flat-users",
    label: "Flat User Management",
    icon: "users",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "summary",
    label: "Financial Summary",
    icon: "summary",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "notifications",
    roles: ["admin", "super", "superadmin"],
    feature: "notification",
  },
  {
    id: "audit",
    label: "Audit Logs",
    icon: "audit",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "service-contacts",
    label: "Service Contacts",
    icon: "contact",
    roles: ["user", "admin", "super", "superadmin", "security"],
  },
  {
    id: "visitor-access",
    label: "Visitor Access",
    icon: "shield",
    roles: ["user"],
  },
  {
    id: "security-desk",
    label: "Security Desk",
    icon: "settings",
    roles: ["security"],
  },
  {
    id: "contact",
    label: "Contact Us",
    icon: "contact",
    roles: ["user", "admin", "super", "superadmin"],
  },
  {
    id: "contact-submissions",
    label: "Contact Submissions",
    icon: "contact",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "feature-config",
    label: "Feature Configuration",
    icon: "settings",
    roles: ["developer"],
  },
  {
    id: "backups",
    label: "Backups",
    icon: "backups",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "users",
    label: "Users",
    icon: "users",
    roles: ["admin", "super", "superadmin"],
  },
  {
    id: "developer-accounts",
    label: "Developer Accounts",
    icon: "users",
    roles: ["super", "superadmin"],
  },
  {
    id: "security",
    label: "Security & Data",
    icon: "settings",
    roles: ["super", "superadmin"],
  },
];
