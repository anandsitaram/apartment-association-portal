import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type SVGProps,
} from "react";
import type {
  ActionBody,
  Data,
  Payment,
  Role,
  Settings,
} from "../shared/types";
import { call, errText, isAuthError, type Save } from "./api.js";
import { DEFAULT_HEADS, inr, label, orgName, orgShort } from "./lib.js";
import { APP_BRAND_NAME, APP_BRAND_SHORT } from "../shared/branding";
import Login from "./components/Login.jsx";
import { MonthTab } from "./features/months/index.js";
import Flats from "./features/flats/index.js";
import Summary from "./features/summary/index.js";
import AuditLog from "./components/AuditLog.jsx";
import Backup from "./components/Backup.jsx";
import MaintenanceSettings from "./features/settings/index.js";
import FeatureConfiguration from "./features/settings/FeatureConfiguration.js";
import Dashboard from "./features/dashboard/index.js";
import { MonthBar } from "./features/months/index.js";
import CorpusFund from "./components/CorpusFund.jsx";
import FlatUserManagement from "./components/FlatUserManagement.jsx";
import Users from "./components/Users.jsx";
import DeveloperAccounts from "./components/DeveloperAccounts.jsx";
import { NewMonthDialog } from "./features/months/index.js";
import Tickets from "./components/Tickets.jsx";
import { HallBooking, GymBooking } from "./features/bookings/index.js";
import NotificationsPanel from "./components/NotificationsPanel.jsx";
import Polls from "./components/Polls.jsx";
import MyMaintenance from "./components/MyMaintenance.jsx";
import ContactUs from "./components/ContactUs.jsx";
import ContactSubmissions from "./components/ContactSubmissions.jsx";
import Events from "./features/events/Events.jsx";
import ToastHost from "./components/ui/ToastHost.jsx";
import DialogHost from "./components/ui/DialogHost.jsx";
import LoadingState from "./components/ui/LoadingState.jsx";
import ErrorState from "./components/ui/ErrorState.jsx";
import EmptyState from "./components/ui/EmptyState.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import { openConfirm } from "./components/ui/appDialog.js";
import { exportCurrentPage } from "./export-page.js";
import SecurityCenter from "./components/SecurityCenter.jsx";
import { notify } from "./components/ui/ToastHost.jsx";
import { printFlatStatement } from "./print-doc.js";
import ChangePassword from "./components/ChangePassword.jsx";
import { usePersistentState } from "./usePersistentState.js";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  roles: string[];
  feature?: string;
}
const ROLE_LABEL: Record<string, string> = {
  user: "Resident",
  admin: "Admin",
  super: "Super Admin",
  superadmin: "Super Admin",
  developer: "Developer",
};

// pages the top-bar "Export Excel" button knows how to export
const EXPORTABLE = new Set([
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
const NEEDS_SCREEN_DATA = new Set([
  "corpus",
  "tickets",
  "hall",
  "gym",
  "events",
  "polls",
  "notifications",
]);

const NAV: NavItem[] = [
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

function NavIcon({ name }: { name: string }) {
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

interface Auth {
  token: string;
  user: { name: string; role: Role; flat?: string | null };
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [booting, setBooting] = useState(true);
  // true once the first data request has finished, so we know for sure whether to show login or the app
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Dark theme (beta): remembered on this device
  const [dark, setDark] = usePersistentState<boolean>("rv_dark", false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#0f172a" : "#0f766e");
  }, [dark]);
  const [data, setData] = useState<Data>({
    months: [],
    payments: [],
    archive: [],
    flats: [],
    settings: {
      hidden: [],
      flatHidden: [],
      custom: [],
      labels: {},
      maintenanceValues: [25],
      expenseValues: [25],
      expenseHeads: DEFAULT_HEADS,
      paymentSplit: "maint_first",
      dueDay: 0,
      orgName: "",
      orgShort: "",
      contactEmail: "",
      whatsappGroupName: "",
      billing: null,
      hallBookingAmount: 0,
    },
    authEnabled: false,
    me: null,
    features: {
      auth: false,
      publicView: false,
      audit: false,
      rateLimit: false,
      reminders: false,
      autoBackup: false,
      mail: false,
      tickets: false,
      hallBooking: false,
      gymBooking: false,
      polls: false,
      events: false,
      notification: false,
    },
    residentOnly: false,
    mine: null,
    corpusLedger: [],
    tickets: [],
    hallBookings: [],
    gymBookings: [],
    polls: [],
    notificationLogs: [],
    featureSystemAvailable: {},
  });
  const [loaded, setLoaded] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showNewMonth, setShowNewMonth] = useState(false);
  const [section, setSection] = useState(() => {
    const storedAuth = auth;
    if (storedAuth?.user?.role === "developer") return "feature-config";
    return localStorage.getItem("rv_section") || "dashboard";
  });
  const [selectedMonth, setSelectedMonth] = useState(
    () => localStorage.getItem("rv_selected_month") || "",
  );
  const [hide, setHide] = useState(localStorage.getItem("rv_hide") === "1");
  const [msg, setMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [corpusLoaded, setCorpusLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const loadSeq = useRef(0);

  const token: string | undefined = auth?.token;
  const role: Role | "public" = auth?.user?.role || "public";
  const admin = role === "admin" || role === "super" || role === "superadmin";
  const superAdmin = role === "super" || role === "superadmin";
  const developer = role === "developer";
  const effRole = superAdmin ? "superadmin" : admin ? "admin" : role;

  const logout = () => {
    localStorage.removeItem("rv_auth");
    setAuth(null);
    setCorpusLoaded(false);
    setNeedLogin(true); // show the login screen straight away, not after a network round trip
  };

  // quiet = refresh in the background and keep the current screen visible (no spinner)
  const load = async (screen = section, quiet = false) => {
    const seq = ++loadSeq.current;
    if (!quiet) setLoaded(false);
    try {
      const d = await call<Data>(
        undefined,
        token,
        screen,
        screen === "months" ? selectedMonth : undefined,
      );
      if (seq !== loadSeq.current) return;
      setData(d);
      if (screen === "corpus") setCorpusLoaded(true);
      localStorage.setItem(
        "rv_org",
        JSON.stringify({
          name: APP_BRAND_NAME,
          short: APP_BRAND_SHORT,
        }),
      );
      setNeedLogin(false);
      setMsg("");
      if (token && !d.me) logout();
      if (!selectedMonth && d.months?.length) {
        const nextMonth = d.months[d.months.length - 1]!.month;
        setSelectedMonth(nextMonth);
        localStorage.setItem("rv_selected_month", nextMonth);
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (isAuthError(e)) {
        if (token) logout();
        setNeedLogin(true);
      } else setMsg(errText(e));
    } finally {
      if (seq === loadSeq.current) {
        setLoaded(true);
        setSessionChecked(true);
      }
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("rv_auth");
      if (stored) setAuth(JSON.parse(stored));
    } catch {
      localStorage.removeItem("rv_auth");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    if (booting) return;
    // Switching between Dashboard and Months: keep what is on screen while refreshing,
    // unless we only hold one month's payments (which the Dashboard cannot use).
    const quiet =
      sessionChecked &&
      !!token &&
      !data.paymentsMonth &&
      (section === "months" || section === "dashboard");
    load(section, quiet);
  }, [token, section, booting]);

  // Browser tab title follows what is actually on screen: loading, login, maintenance or the current page
  const onLoginScreen = (needLogin && !auth) || showLogin;
  const inMaintenance =
    auth?.user.role === "user" && !!data.maintenanceMode?.enabled;
  useEffect(() => {
    const page = NAV.find(
      (n) =>
        n.id === section &&
        n.roles.includes(effRole) &&
        (!n.feature || (data.features as any)[n.feature] !== false),
    );
    const name =
      booting || !sessionChecked
        ? "Loading"
        : onLoginScreen
          ? "Login"
          : inMaintenance
            ? "Under maintenance"
            : page?.label || "Dashboard";
    document.title = `${name} · ${APP_BRAND_NAME}`;
  }, [
    section,
    effRole,
    booting,
    sessionChecked,
    onLoginScreen,
    inMaintenance,
    data.features,
  ]);

  // Block the browser back button / trackpad swipe-back so it doesn't leave the app by accident
  useEffect(() => {
    history.pushState({ rv: 1 }, "", location.href);
    const onPop = () => history.pushState({ rv: 1 }, "", location.href);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Months screen holds only the selected month's payments: fetch when another month is picked
  useEffect(() => {
    if (
      !booting &&
      sessionChecked &&
      section === "months" &&
      selectedMonth &&
      data.paymentsMonth &&
      data.paymentsMonth !== selectedMonth
    )
      load("months", true);
  }, [selectedMonth, section, data.paymentsMonth, sessionChecked]);

  useEffect(() => {
    if (
      data.months.length &&
      !data.months.some((m) => m.month === selectedMonth)
    ) {
      setSelectedMonth(data.months[data.months.length - 1]!.month);
    }
  }, [data.months, selectedMonth]);

  useEffect(() => {
    if (selectedMonth) localStorage.setItem("rv_selected_month", selectedMonth);
  }, [selectedMonth]);

  const login = async (username: string, password: string) => {
    try {
      const r = await call<Auth>({ action: "login", username, password });
      localStorage.setItem("rv_auth", JSON.stringify(r));
      setAuth(r);
      // Start every standard account on Dashboard after an explicit sign-in,
      // rather than restoring a page left open by the previous account.
      // Developer accounts use their dedicated Feature Configuration landing page.
      const landingSection =
        r.user.role === "developer" ? "feature-config" : "dashboard";
      localStorage.setItem("rv_section", landingSection);
      setSection(landingSection);
      setShowLogin(false);
      setSidebarOpen(false);
      setMsg("");
    } catch (e) {
      setMsg(errText(e));
    }
  };

  const save: Save = async (body) => {
    try {
      await call(body, token);
      await load(section, true);
      setMsg("");
      notify("Saved", "success");
      return true;
    } catch (e) {
      setMsg(errText(e));
      if (/Login required/.test(errText(e))) {
        logout();
        load();
      }
      return false;
    }
  };

  const addMonth = () => setShowNewMonth(true);
  const createMonth = async (body: ActionBody) => {
    const ok = await save(body);
    if (ok) {
      setSelectedMonth(String(body.month));
      setSection("months");
    }
    return ok;
  };

  const clearAllAmounts = async () => {
    const ok = await openConfirm({
      title: "Clear all payment amounts?",
      message: `Clear ALL amounts for ${label(selectedMonth)}? This sets expense and maintenance/Corp Fund payment amounts to ₹0 while keeping descriptions and settings.`,
      confirmLabel: "Clear amounts",
      danger: true,
    });
    if (!ok) return false;
    return save({ action: "clearAllAmounts", month: selectedMonth });
  };

  const del = async () => {
    const ok = await openConfirm({
      title: `Delete ${label(selectedMonth)}?`,
      message:
        "This deletes the month and its payment entries from the database. The Summary keeps archived figures. This cannot be undone.",
      confirmLabel: "Delete month",
      danger: true,
    });
    if (!ok) return false;
    const wasDeleted = selectedMonth;
    const saved = await save({ action: "deleteMonth", month: selectedMonth });
    if (saved) {
      const remaining = data.months.filter((x) => x.month !== wasDeleted);
      setSelectedMonth(remaining.at(-1)?.month || "");
      setSection("summary");
    }
    return saved;
  };

  const closeMonth = async (remaining: number) => {
    const ok = await openConfirm({
      title: "Close this month?",
      message: `Transfer this month's leftover maintenance (${inr(remaining)}) to the Corpus Fund ledger? Running it again updates the existing entry.`,
      confirmLabel: "Close month",
      danger: true,
    });
    if (!ok) return false;
    return save({ action: "closeMonth", month: selectedMonth });
  };

  const toggleHide = () => {
    localStorage.setItem("rv_hide", hide ? "0" : "1");
    setHide(!hide);
  };

  const currentMonth = useMemo(
    () =>
      data.months.find((x) => x.month === selectedMonth) || data.months.at(-1),
    [data.months, selectedMonth],
  );
  const pays: Record<string, Payment> = Object.fromEntries(
    data.payments
      .filter((p) => p.month === currentMonth?.month)
      .map((p) => [p.flat, p]),
  );

  if (booting || !sessionChecked) {
    return (
      <div
        className="auth-boot"
        aria-busy="true"
        role="status"
        aria-live="polite"
      >
        <div className="auth-boot-brand" aria-hidden="true">
          CG
        </div>
        <strong>Loading your workspace…</strong>
        <span className="auth-boot-subtitle">
          {APP_BRAND_NAME} Owners Association
        </span>
      </div>
    );
  }

  if ((needLogin && !auth) || showLogin) {
    return (
      <Login
        onLogin={login}
        msg={msg}
        onCancel={showLogin ? () => setShowLogin(false) : null}
      />
    );
  }

  if (auth?.user.role === "user" && data.maintenanceMode?.enabled) {
    return (
      <div className="maintenance-screen">
        <div className="card">
          <h2>MAINTENANCE</h2>
          <p>{data.maintenanceMode.message}</p>
          <p className="muted">Please try again shortly.</p>
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter(
    (n) =>
      n.roles.includes(effRole) &&
      (!n.feature || (data.features as any)[n.feature] !== false),
  );
  const navigate = async (id: string) => {
    localStorage.setItem("rv_section", id);
    setSection(id);
    setSidebarOpen(false);
  };
  const displayMonth = currentMonth
    ? label(currentMonth.month)
    : label(new Date().toISOString().slice(0, 7));

  const renderContent = () => {
    if (!visibleNav.some((n) => n.id === section)) {
      return (
        <Dashboard
          data={data}
          flats={data.flats}
          month={currentMonth?.month}
          onMonthChange={setSelectedMonth}
          admin={admin}
          onAddMonth={addMonth}
          loading={!loaded}
        />
      );
    }
    if (NEEDS_SCREEN_DATA.has(section) && !loaded) {
      return <LoadingState label="Loading…" />;
    }
    if (
      section === "months" &&
      (!loaded ||
        (data.paymentsMonth &&
          currentMonth &&
          data.paymentsMonth !== currentMonth.month))
    ) {
      return <LoadingState label="Loading maintenance records…" />;
    }
    if (section === "months" && msg && !data.months.length) {
      return (
        <ErrorState
          title="Could not load months"
          message={msg}
          onRetry={() => load("months")}
        />
      );
    }
    if (!currentMonth && section === "months") {
      return (
        <EmptyState
          title="No months yet"
          message="Create the first month to start recording maintenance payments."
          action={
            admin ? (
              <button className="btn-primary" onClick={addMonth}>
                + Add month
              </button>
            ) : undefined
          }
        />
      );
    }
    switch (section) {
      case "dashboard":
        return (
          <Dashboard
            data={data}
            flats={data.flats}
            month={currentMonth?.month}
            onMonthChange={setSelectedMonth}
            admin={admin}
            onAddMonth={addMonth}
            loading={!loaded}
          />
        );
      case "months":
        return (
          <>
            <MonthBar
              data={data}
              flats={data.flats}
              month={currentMonth!.month}
              onSelect={setSelectedMonth}
            />
            <MonthTab
              m={currentMonth!}
              flats={data.flats}
              pays={pays}
              admin={admin}
              hide={hide}
              settings={data.settings}
              ledger={data.corpusLedger}
              onSave={save}
              onClearAll={admin ? clearAllAmounts : null}
              onDelete={superAdmin ? del : null}
              onCloseMonth={admin ? closeMonth : null}
              token={token}
              isLatest={
                currentMonth?.month ===
                data.months[data.months.length - 1]?.month
              }
              canRemind={data.features.notification !== false}
            />
          </>
        );
      case "corpus":
        return (
          <CorpusFund
            data={data}
            flats={data.flats}
            admin={admin}
            superAdmin={superAdmin}
            onSave={save}
          />
        );
      case "mymaintenance":
        return (
          <MyMaintenance
            data={data}
            flat={auth?.user?.flat || data.mine || null}
          />
        );
      case "tickets":
        return (
          <Tickets
            data={data}
            admin={admin}
            superAdmin={superAdmin}
            myFlat={auth?.user?.flat || data.mine || null}
            onSave={save}
          />
        );
      case "hall":
        return (
          <HallBooking
            data={data}
            admin={admin}
            superAdmin={superAdmin}
            myFlat={auth?.user?.flat || data.mine || null}
            onSave={save}
            settings={data.settings}
          />
        );
      case "gym":
        return (
          <GymBooking
            data={data}
            admin={admin}
            superAdmin={superAdmin}
            myFlat={auth?.user?.flat || data.mine || null}
            onSave={save}
          />
        );
      case "events":
        return (
          <Events
            data={data}
            admin={admin}
            superAdmin={superAdmin}
            onSave={save}
          />
        );
      case "polls":
        return (
          <Polls
            data={data}
            admin={admin}
            superAdmin={superAdmin}
            onSave={save}
          />
        );
      case "flats":
        return (
          <Flats
            flats={data.flats}
            onSave={save}
            admin={admin}
            superAdmin={superAdmin}
            settings={data.settings}
            onStatement={(flat) => printFlatStatement(data, flat)}
            onOpenBulk={() => void navigate("flat-users")}
          />
        );
      case "summary":
        return (
          <Summary
            data={data}
            flats={data.flats}
            hide={hide}
            admin={admin}
            settings={data.settings}
            onSave={save}
            loading={!loaded}
            mine={data.mine}
            residentOnly={data.residentOnly ?? false}
          />
        );
      case "audit":
        return (
          <>
            <h2>AUDIT LOGS</h2>
            <AuditLog token={token} superAdmin={superAdmin} />
          </>
        );
      case "contact":
        return (
          <ContactUs
            settings={data.settings}
            onSave={save}
            showWhatsApp={!!auth}
          />
        );
      case "contact-submissions":
        return <ContactSubmissions token={token} superAdmin={superAdmin} />;
      case "feature-config":
        return developer || superAdmin ? (
          <FeatureConfiguration
            features={data.features}
            systemAvailable={data.featureSystemAvailable}
            onSave={save}
          />
        ) : null;
      case "settings":
        return (
          <>
            <MaintenanceSettings
              settings={data.settings}
              months={data.months}
              onSave={save}
              superAdmin={superAdmin}
              admin={admin}
              features={data.features}
              featureSystemAvailable={data.featureSystemAvailable}
            />
          </>
        );
      case "backups":
        return (
          <>
            <h2>BACKUPS</h2>
            <Backup
              token={token}
              features={data.features}
              superAdmin={superAdmin}
              settings={data.settings}
            />
          </>
        );
      case "flat-users":
        return admin ? (
          <FlatUserManagement
            token={token}
            flats={data.flats}
            onImportFlats={async (rows, mode) => {
              const result = await call<any>(
                { action: "importFlats", rows, mode },
                token,
              );
              await load(section, true);
              notify("Flat data import completed", "success");
              return result;
            }}
            onOpenFlats={() => void navigate("flats")}
            onOpenUsers={() => void navigate("users")}
          />
        ) : null;
      case "users":
        return admin ? (
          <Users
            token={token}
            onOpenFlatUsers={() => void navigate("flat-users")}
            me={auth?.user?.name}
            flats={data.flats}
            superAdmin={superAdmin}
            allowAdminUserDeletion={
              data.settings.allowAdminUserDeletion !== false
            }
          />
        ) : null;
      case "developer-accounts":
        return superAdmin ? (
          <DeveloperAccounts token={token} me={auth?.user?.name} />
        ) : null;
      case "security":
        return superAdmin ? (
          <>
            <h2>SECURITY & DATA</h2>
            <SecurityCenter token={token} />
          </>
        ) : null;
      case "notifications":
        return admin && data.features.notification !== false ? (
          <NotificationsPanel
            data={data}
            superAdmin={superAdmin}
            onSave={save}
          />
        ) : null;
      default:
        return (
          <Dashboard
            data={data}
            flats={data.flats}
            month={currentMonth?.month}
            onMonthChange={setSelectedMonth}
            admin={admin}
            onAddMonth={addMonth}
            loading={!loaded}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <ToastHost />
      <DialogHost />
      {showNewMonth && (
        <NewMonthDialog
          months={data.months}
          flats={data.flats}
          settings={data.settings}
          onCreate={createMonth}
          onClose={() => setShowNewMonth(false)}
        />
      )}
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">{APP_BRAND_SHORT}</div>
          <div>
            <strong>{APP_BRAND_NAME}</strong>
            <span>Maintenance</span>
          </div>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {auth && (
          <button
            className="logout-nav"
            onClick={() => {
              setSidebarOpen(false);
              setShowPassword(true);
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              🔑
            </span>
            <span>Change password</span>
          </button>
        )}
        {showPassword && (
          <ChangePassword
            token={token}
            onClose={() => setShowPassword(false)}
            onDone={() => {
              setShowPassword(false);
              logout();
            }}
          />
        )}
        {auth ? (
          <button className="logout-nav" onClick={logout}>
            <span className="nav-icon">
              <NavIcon name="logout" />
            </span>
            <span>
              Logout
              {role !== "public"
                ? ` (${ROLE_LABEL[effRole] || ROLE_LABEL[role]})`
                : ""}
            </span>
          </button>
        ) : (
          <button
            className="login-nav"
            onClick={() => {
              setShowLogin(true);
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">
              <NavIcon name="login" />
            </span>
            <span>Login</span>
          </button>
        )}
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              aria-label="Toggle navigation"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              ☰
            </button>
            <strong>
              {visibleNav.find((x) => x.id === section)?.label || "Dashboard"}
            </strong>
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="theme-toggle"
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme (beta)"
              }
              title={dark ? "Light theme" : "Dark theme (beta)"}
              onClick={() => setDark(!dark)}
            >
              {dark ? "☀️" : "🌙"}
            </button>
            {admin && EXPORTABLE.has(section) && (
              <button
                className="top-login"
                type="button"
                disabled={!loaded || exporting}
                title={`Export ${visibleNav.find((x) => x.id === section)?.label || "page"} data to Excel`}
                onClick={async () => {
                  if (!loaded || exporting) return;
                  setExporting(true);
                  try {
                    await exportCurrentPage(section, data, token);
                  } catch (e) {
                    setMsg(`Export failed: ${errText(e)}`);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? "Preparing Excel…" : "↓ Export Excel"}
              </button>
            )}
            {!auth && (
              <button className="top-login" onClick={() => setShowLogin(true)}>
                Login
              </button>
            )}
          </div>
        </header>

        {msg && (
          <div className="toast-error" role="alert">
            <span>{msg}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss message"
              onClick={() => setMsg("")}
            >
              ×
            </button>
          </div>
        )}
        <main className="page-content">
          {section !== "dashboard" && (
            <div className="page-heading">
              <div>
                <h1>
                  {visibleNav.find((x) => x.id === section)?.label ||
                    "Dashboard"}
                </h1>
                <p>
                  {{
                    summary: "Month-wise and yearly financial position",
                    months: admin
                      ? "Record expenses and payments for each month"
                      : "Month-wise maintenance records (read only)",
                    flats: "Flat details and owner contacts",
                    corpus: admin
                      ? "Track corpus fund deposits and withdrawals"
                      : "Corpus fund deposits and withdrawals (read only)",
                    mymaintenance:
                      "Your flat's maintenance and Corp Fund payment history",
                    tickets: "Delivery, security and maintenance requests",
                    hall: "Book the party hall and see upcoming functions",
                    gym: "Book the gym and see upcoming sessions",
                    polls:
                      "Vote on the next meeting date or a planned activity",
                    users:
                      "Manage Admin accounts, role permissions, and contact details",
                    "flat-users":
                      "Bulk import and export of flat data and resident login accounts",
                    notifications:
                      "Send Email, SMS or WhatsApp announcements and reminders",
                    "feature-config":
                      "Enable or disable optional application modules",
                    "developer-accounts":
                      "Create and manage Developer accounts",
                  }[section] ||
                    `Manage ${APP_BRAND_NAME} maintenance data and records`}
                </p>
              </div>
              <div className="heading-actions">
                {admin && ["months", "summary"].includes(section) && (
                  <button
                    className="icon-button"
                    onClick={toggleHide}
                    title={hide ? "Show names" : "Hide names"}
                  >
                    {hide ? "◉" : "◌"}
                  </button>
                )}
                {admin && section === "months" && (
                  <button className="btn-primary" onClick={addMonth}>
                    + Add month
                  </button>
                )}
              </div>
            </div>
          )}
          <ErrorBoundary>{renderContent()}</ErrorBoundary>
        </main>
        <footer className="app-footer">
          <div className="footer-content">
            <span>
              © {new Date().getFullYear()} {APP_BRAND_NAME}
            </span>
            {data.settings.contactEmail ? (
              <a href={`mailto:${data.settings.contactEmail}`}>
                {data.settings.contactEmail}
              </a>
            ) : (
              <span>Maintenance portal</span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
