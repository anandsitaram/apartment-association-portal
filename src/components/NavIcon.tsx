import type { ReactElement, SVGProps } from "react";

export default function NavIcon({ name }: { name: string }) {
  const common: SVGProps<SVGSVGElement> = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths: Record<string, ReactElement> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M16 2v4M8 2v4M3 9h18" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    expenses: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 12h6M9 16h6M14 3v4h4" />
      </>
    ),
    flats: (
      <>
        <path d="M4 21V7l8-4 8 4v14" />
        <path d="M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01" />
      </>
    ),
    summary: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10M7 12h4M14 12h3M7 16h10" />
      </>
    ),
    reports: (
      <>
        <path d="M4 19V5M4 19h16" />
        <path d="M8 16v-4M12 16V8M16 16v-7" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M18 15c2 .3 3 1.9 3 4" />
      </>
    ),
    audit: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    settings: (
      <>
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    backups: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    corpus: (
      <>
        <path d="M3 21h18M4 21V10l8-5 8 5v11" />
        <path d="M9 21v-6h6v6M9 10h.01M12 10h.01M15 10h.01" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21c.5-4 3-6 7-6s6.5 2 7 6" />
      </>
    ),
    login: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
    logout: (
      <>
        <path d="M14 7l5 5-5 5" />
        <path d="M19 12H7" />
        <path d="M3 19V5a2 2 0 0 1 2-2h6" />
      </>
    ),
    tickets: (
      <>
        <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
        <path d="M10 6v12" strokeDasharray="2 2" />
      </>
    ),
    hall: (
      <>
        <path d="M3 21h18M5 21V9l7-6 7 6v12" />
        <path d="M9 21v-6h6v6M9 12h.01M15 12h.01" />
      </>
    ),
    polls: (
      <>
        <path d="M6 20V10M12 20V4M18 20v-7" />
        <path d="M3 20h18" />
      </>
    ),
    mymaintenance: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21c.5-4 3-6 7-6s6.5 2 7 6" />
        <path d="M9 3.5l1.5 1.5L14 1" />
      </>
    ),
    gym: (
      <>
        <path d="M6 7v10M18 7v10" />
        <path d="M2 9v6M22 9v6" />
        <path d="M6 12h12" />
      </>
    ),
    contact: (
      <>
        <path d="M4 5h16v12H8l-4 4z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    notifications: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>
    ),
  };
  return <svg {...common}>{paths[name] || paths.dashboard}</svg>;
}
