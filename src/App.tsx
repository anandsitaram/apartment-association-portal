import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionBody,
  Data,
  Payment,
  Role,
  Settings,
} from "../shared/types";
import { call, errText, isAuthError, type Save } from "./api.js";
import { DEFAULT_HEADS, inr, label, orgName, orgShort } from "../shared/lib.js";
import { APP_BRAND_NAME, APP_BRAND_SHORT } from "../shared/branding";
import Login from "./components/Login.jsx";
import { MonthTab, MonthBar, NewMonthDialog } from "./features/months/index.js";
import Dashboard from "./features/dashboard/index.js";
import ToastHost from "./components/ui/ToastHost.jsx";
import DialogHost from "./components/ui/DialogHost.jsx";
import LoadingState from "./components/ui/LoadingState.jsx";
import TableSkeleton from "./components/ui/TableSkeleton.jsx";
import ErrorState from "./components/ui/ErrorState.jsx";
import EmptyState from "./components/ui/EmptyState.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import { openConfirm } from "./components/ui/appDialog.js";
import { exportCurrentPage } from "./export-page.js";
import { notify } from "./components/ui/ToastHost.jsx";
import { printFlatStatement } from "./print-doc.js";
import { usePersistentState } from "./usePersistentState.js";
import NavIcon from "./components/NavIcon.js";
import { EXPORTABLE, NAV, ROLE_LABEL } from "../shared/navigation.js";
import { isAdminRole, isSuperRole } from "../shared/roles.js";
import { clearSession, readSession, writeSession } from "./session-storage.js";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "./safe-storage.js";

// Code-split every page/panel that isn't needed for the very first paint
// (Dashboard + Login + Months are the common landing views and stay eager).
// Each of these pulls in its own chunk only when the user actually opens
// that section, which keeps the initial bundle small.
const Flats = lazy(() => import("./features/flats/index.js"));
const Summary = lazy(() => import("./features/summary/index.js"));
const AuditLog = lazy(() => import("./components/AuditLog.jsx"));
const Backup = lazy(() => import("./components/Backup.jsx"));
const MaintenanceSettings = lazy(() => import("./features/settings/index.js"));
const FeatureConfiguration = lazy(
  () => import("./features/settings/FeatureConfiguration.js"),
);
const CorpusFund = lazy(() => import("./components/CorpusFund.jsx"));
const FlatUserManagement = lazy(
  () => import("./components/FlatUserManagement.jsx"),
);
const Users = lazy(() => import("./components/Users.jsx"));
const DeveloperAccounts = lazy(
  () => import("./components/DeveloperAccounts.jsx"),
);
const Tickets = lazy(() => import("./components/Tickets.jsx"));
const ServiceContacts = lazy(() => import("./components/ServiceContacts.jsx"));
const SecurityDesk = lazy(() => import("./components/SecurityDesk.jsx"));
const HallBooking = lazy(() =>
  import("./features/bookings/index.js").then((m) => ({
    default: m.HallBooking,
  })),
);
const GymBooking = lazy(() =>
  import("./features/bookings/index.js").then((m) => ({
    default: m.GymBooking,
  })),
);
const NotificationsPanel = lazy(
  () => import("./components/NotificationsPanel.jsx"),
);
const Polls = lazy(() => import("./components/Polls.jsx"));
const MyMaintenance = lazy(() => import("./components/MyMaintenance.jsx"));
const ContactUs = lazy(() => import("./components/ContactUs.jsx"));
const ContactSubmissions = lazy(
  () => import("./components/ContactSubmissions.jsx"),
);
const Events = lazy(() => import("./features/events/Events.jsx"));
const SecurityCenter = lazy(() => import("./components/SecurityCenter.jsx"));
const ChangePassword = lazy(() => import("./components/ChangePassword.jsx"));

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
      ?.setAttribute("content", dark ? "#0f172a" : "#2E7D32");
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
      serviceContacts: [],
    },
    authEnabled: false,
    me: null,
    features: {
      auth: false,
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
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const [section, setSection] = useState(() => {
    const storedAuth = auth;
    if (storedAuth?.user?.role === "developer") return "feature-config";
    return readBrowserStorage("rv_section") || "dashboard";
  });
  const [selectedMonth, setSelectedMonth] = useState(
    () => readBrowserStorage("rv_selected_month") || "",
  );
  const hide = false;
  const [msg, setMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [corpusLoaded, setCorpusLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const loadSeq = useRef(0);

  const token: string | undefined = auth?.token;
  const role: Role | "public" = auth?.user?.role || "public";
  const admin = isAdminRole(role);
  const superAdmin = isSuperRole(role);
  const developer = role === "developer";
  const effRole = superAdmin ? "superadmin" : admin ? "admin" : role;

  const logout = () => {
    void clearSession().catch(() => undefined);
    setAuth(null);
    setCorpusLoaded(false);
    setNeedLogin(true); // show the login screen straight away, not after a network round trip
  };

  // quiet = refresh in the background and keep the current screen visible (no spinner)
  const load = async (
    screen = section,
    quiet = false,
    monthOverride?: string,
  ): Promise<boolean> => {
    const seq = ++loadSeq.current;
    if (!quiet) setLoaded(false);
    try {
      const d = await call<Data>(
        undefined,
        token,
        screen,
        screen === "months" ? (monthOverride ?? selectedMonth) : undefined,
      );
      if (seq !== loadSeq.current) return false;
      setData(d);
      if (screen === "corpus") setCorpusLoaded(true);
      writeBrowserStorage(
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
        writeBrowserStorage("rv_selected_month", nextMonth);
      }
      return true;
    } catch (e) {
      if (seq !== loadSeq.current) return false;
      if (isAuthError(e)) {
        if (token) logout();
        setNeedLogin(true);
      } else if (quiet) {
        notify(`Couldn't refresh the view: ${errText(e)}`, "error");
        const requestedMonth = monthOverride ?? selectedMonth;
        if (
          screen === "months" &&
          data.paymentsMonth &&
          data.paymentsMonth !== requestedMonth
        ) {
          setMsg(errText(e));
        }
      } else setMsg(errText(e));
      return false;
    } finally {
      if (seq === loadSeq.current) {
        setLoaded(true);
        setSessionChecked(true);
      }
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      let hasSession = false;
      try {
        const stored = await readSession();
        if (active && stored) {
          const parsed = JSON.parse(stored) as Auth;
          if (parsed?.token && parsed?.user?.role) {
            setAuth(parsed);
            hasSession = true;
          } else {
            await clearSession().catch(() => undefined);
          }
        }
      } catch {
        await clearSession().catch(() => undefined);
      } finally {
        if (active) {
          // Do not render the public dashboard or request protected data before
          // sign-in. A missing session goes directly to the login screen.
          if (!hasSession) {
            setNeedLogin(true);
            setSessionChecked(true);
            setLoaded(true);
          }
          setBooting(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (booting) return;
    if (!token) {
      // Never call the protected snapshot endpoint anonymously. This avoids a
      // database initialization round-trip and prevents the dashboard shell
      // from appearing before the login screen.
      setNeedLogin(true);
      setLoaded(true);
      setSessionChecked(true);
      return;
    }
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

  // Block the browser back button / trackpad swipe-back so it doesn't leave the app by accident.
  //
  // Deliberate trade-off, not an oversight: this is a single-page app with no
  // in-app "pages" to go back to (section switches don't push history entries),
  // so a stray back-swipe would otherwise exit straight to whatever the browser
  // had open before this tab, which on a shared/lobby device could leave a
  // signed-in session sitting there. This intentionally overrides normal
  // browser back-button behavior app-wide; please don't "fix" it without
  // re-checking that reasoning first.
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
    if (selectedMonth) writeBrowserStorage("rv_selected_month", selectedMonth);
  }, [selectedMonth]);

  const login = async (username: string, password: string) => {
    try {
      const r = await call<Auth>({ action: "login", username, password });
      await writeSession(JSON.stringify(r));
      setAuth(r);
      setNeedLogin(false);
      setLoaded(false);
      setSessionChecked(false);
      // Start every standard account on Dashboard after an explicit sign-in,
      // rather than restoring a page left open by the previous account.
      // Developer accounts use their dedicated Feature Configuration landing page.
      const landingSection =
        r.user.role === "developer"
          ? "feature-config"
          : r.user.role === "security"
            ? "security-desk"
            : "dashboard";
      writeBrowserStorage("rv_section", landingSection);
      setSection(landingSection);
      setShowLogin(false);
      setShowDemoNotice(true);
      setSidebarOpen(false);
      setMsg("");
    } catch (e) {
      setMsg(errText(e));
    }
  };

  const save: Save = async (body) => {
    // Capture every scrollable area, not just the window. The Months screen has
    // its own `.month-scroll` container, so restoring window.scrollY alone does
    // not preserve the visible position after the month data is refreshed.
    const scrollSnapshot = (() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("body, body *"),
      );
      return {
        windowX: window.scrollX,
        windowY: window.scrollY,
        elements: nodes
          .filter(
            (el) =>
              el.scrollHeight > el.clientHeight + 2 ||
              el.scrollWidth > el.clientWidth + 2,
          )
          .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft })),
      };
    })();
    const restoreScroll = () => {
      window.scrollTo({
        left: scrollSnapshot.windowX,
        top: scrollSnapshot.windowY,
        behavior: "auto",
      });
      for (const item of scrollSnapshot.elements) {
        if (item.el.isConnected) {
          item.el.scrollTop = item.top;
          item.el.scrollLeft = item.left;
        }
      }
    };
    try {
      const actionResult = await call<Record<string, unknown>>(body, token);
      // A create request can race with another attempt or a prior request whose
      // response was lost. The server reports that case as alreadyExists; it is
      // not a successful save and must never produce a "Saved" toast.
      if (
        body.action === "saveMonth" &&
        body.create === true &&
        actionResult?.alreadyExists === true
      ) {
        // Refresh in the background so the dialog can immediately leave its
        // busy state. The refreshed month list will show the inline duplicate
        // warning instead of trapping the user on "Creating…".
        void load(section, true);
        return false;
      }
      // Keep expense totals and the month-end balance accurate immediately after
      // an expense amount is edited or a row is removed, even if the follow-up
      // snapshot refresh fails (for example, while a legacy encrypted row is
      // still being recovered). The server write above has already succeeded.
      if (
        body.action === "saveMonth" &&
        typeof body.month === "string" &&
        Array.isArray(body.expenses)
      ) {
        const savedExpenses = body.expenses.map((expense: any) => ({
          description: String(expense?.description ?? ""),
          amount: Number(expense?.amount) || 0,
        }));
        setData((current) => ({
          ...current,
          months: current.months.map((month) =>
            month.month === body.month
              ? { ...month, expenses: savedExpenses }
              : month,
          ),
        }));
      } else if (
        body.action === "clearAllAmounts" &&
        typeof body.month === "string"
      ) {
        setData((current) => ({
          ...current,
          months: current.months.map((month) =>
            month.month === body.month
              ? {
                  ...month,
                  expenses: (month.expenses || []).map((expense) => ({
                    ...expense,
                    amount: 0,
                  })),
                }
              : month,
          ),
        }));
      }
      if (body.action !== "deleteMonth") await load(section, true);
      // Wait until React has committed refreshed data before restoring both
      // page and nested scroll positions.
      requestAnimationFrame(() => requestAnimationFrame(restoreScroll));
      // Create has its own explicit success message below. All other successful
      // mutations get an action-specific toast even if the follow-up refresh fails.
      if (!(body.action === "saveMonth" && body.create === true)) {
        const messages: Record<string, string> = {
          saveMonth: "Month updated successfully",
          deleteMonth: "Month deleted successfully",
          completeMonth: "Month completed successfully",
          undoCompleteMonth: "Month completion undone successfully",
          saveCorpusEntry: "Corp Fund updated successfully",
          saveCorpRate: "Corp Fund rate updated successfully",
          deleteCorpusEntry: "Corp Fund entry deleted successfully",
          closeMonth: "Balance transferred to Corp Fund successfully",
          cancelMonthTransfer: "Corp Fund transfer undone successfully",
          archiveMonth: "Month archived successfully",
          unarchiveMonth: "Month unarchived successfully",
          savePayments: "Payments saved successfully",
          clearAllAmounts: "Expense amounts cleared successfully",
          clearPayments: "Flat payment amounts cleared successfully",
          saveSettings: "Settings updated successfully",
          saveFlat: "Flat updated successfully",
          deleteFlat: "Flat deleted successfully",
          saveUser: "User updated successfully",
          deleteUser: "User deleted successfully",
          importFlats: "Flat data imported successfully",
          importFlatUsers: "Flat user data imported successfully",
          backup: "Backup created successfully",
          restoreBackup: "Backup restored successfully",
          setRetention: "Retention settings updated successfully",
          clearAuditLog: "Audit log cleared successfully",
          clearNotificationLogs: "Notification logs cleared successfully",
          createSecurityCode: "Visitor access code created successfully",
          deleteMySecurityCode: "Visitor access code deleted successfully",
          acceptSecurityCode: "Visitor entry recorded successfully",
          revokeUserSessions: "User sessions revoked successfully",
          sendReminders: "Payment reminders sent successfully",
          createBooking: "Hall booking created successfully",
          updateBookingStatus: "Hall booking updated successfully",
          deleteBooking: "Hall booking deleted successfully",
          createGymBooking: "Gym booking created successfully",
          updateGymBookingStatus: "Gym booking updated successfully",
          cancelGymBooking: "Gym booking cancelled successfully",
          createEvent: "Event created successfully",
          updateEvent: "Event updated successfully",
          deleteEvent: "Event deleted successfully",
          createPoll: "Poll created successfully",
          votePoll: "Vote submitted successfully",
          deletePoll: "Poll deleted successfully",
          createTicket: "Ticket created successfully",
          updateTicketStatus: "Ticket status updated successfully",
          deleteTicket: "Ticket deleted successfully",
          changePassword: "Password changed successfully",
          setMaintenanceMode: "Maintenance mode updated successfully",
          saveFeatureConfig: "Feature configuration updated successfully",
          markContactRead: "Contact submission updated successfully",
          sendContactMessage: "Message sent successfully",
          sendNotificationMessage: "Notification sent successfully",
        };
        notify(
          messages[String(body.action)] || "Changes saved successfully",
          "success",
        );
      }
      return true;
    } catch (e) {
      // Action-level failures go through the same toast the success path
      // uses, instead of the shared `msg` banner: `msg` is reserved for
      // "the whole page failed to load" / login-screen errors, so a save
      // failure here can't silently overwrite or get overwritten by those.
      notify(errText(e), "error");
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
      const createdMonth = String(body.month);
      setSelectedMonth(createdMonth);
      writeBrowserStorage("rv_selected_month", createdMonth);
      setSection("months");
      notify("Month added successfully", "success");
      // `save` already refreshed the current view. Changing the selected month
      // and section triggers the normal Months loader; do not wait on a second
      // request here, or the dialog can remain stuck on "Creating…" after the
      // new month has already appeared in the refreshed list.
    }
    return ok;
  };

  const clearAllAmounts = async () => {
    const ok = await openConfirm({
      title: "Clear expense amounts?",
      message: `Set all expense amounts for ${label(selectedMonth)} to ₹0 while keeping expense descriptions, flat payments, and billing settings unchanged.`,
      confirmLabel: "Clear expense amounts",
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
      const remaining = data.months
        .filter((x) => x.month !== wasDeleted)
        .sort((a, b) => a.month.localeCompare(b.month));
      const nextMonth = remaining.at(-1)?.month || "";
      setData((current) => ({
        ...current,
        months: current.months.filter((x) => x.month !== wasDeleted),
        payments: current.payments.filter((x) => x.month !== wasDeleted),
      }));
      setSelectedMonth(nextMonth);
      if (nextMonth) writeBrowserStorage("rv_selected_month", nextMonth);
      else removeBrowserStorage("rv_selected_month");

      // Deleting a month should not redirect to Financial Summary. Keep the
      // admin in Months when another live month exists; otherwise show the
      // Dashboard's empty-state prompt to create a month.
      const nextSection = nextMonth ? "months" : "dashboard";
      setSection(nextSection);
      await load(nextSection, false, nextMonth || undefined);
    }
    return saved;
  };

  const cancelMonthTransfer = async () => {
    const ok = await openConfirm({
      title: "Undo Corp Fund transfer?",
      message:
        "This removes only this month's month-end transfer from the Corp Fund ledger. Maintenance payments and actual expenses will remain unchanged.",
      confirmLabel: "Undo transfer",
      danger: true,
    });
    if (!ok) return false;
    return save({ action: "cancelMonthTransfer", month: selectedMonth });
  };
  const completeMonth = async (combineCarryForward: boolean) =>
    save({
      action: "completeMonth",
      month: selectedMonth,
      combineCarryForward,
    });

  const undoCompleteMonth = async () =>
    save({ action: "undoCompleteMonth", month: selectedMonth });

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
          RV
        </div>
        <strong>Loading your workspace…</strong>
        <span className="auth-boot-subtitle">My Apartment</span>
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
    writeBrowserStorage("rv_section", id);
    setSection(id);
    setSidebarOpen(false);
  };
  const displayMonth = currentMonth
    ? label(currentMonth.month)
    : label(new Date().toISOString().slice(0, 7));

  const renderContent = () => {
    if (!visibleNav.some((n) => n.id === section)) {
      if (msg && !data.months.length) {
        return (
          <ErrorState
            title="Could not load your data"
            message={msg}
            onRetry={() => load()}
          />
        );
      }
      return (
        <Dashboard
          data={data}
          flats={data.flats}
          month={currentMonth?.month}
          onMonthChange={setSelectedMonth}
          onNavigate={navigate}
          admin={admin}
          onAddMonth={addMonth}
          loading={!loaded}
        />
      );
    }
    if (!loaded && section !== "dashboard" && section !== "months") {
      const currentPageLabel =
        NAV.find((item) => item.id === section)?.label || "page data";
      return (
        <TableSkeleton label={`Loading ${currentPageLabel.toLowerCase()}…`} />
      );
    }
    if (section === "months" && !loaded) {
      return <TableSkeleton label="Loading maintenance records…" />;
    }
    if (
      section === "months" &&
      data.paymentsMonth &&
      currentMonth &&
      data.paymentsMonth !== currentMonth.month
    ) {
      if (msg) {
        return (
          <ErrorState
            title="Could not load this month"
            message={msg}
            onRetry={() => load("months", false, currentMonth.month)}
          />
        );
      }
      return <TableSkeleton label="Loading maintenance records…" />;
    }
    if (section !== "months" && section !== "dashboard" && msg) {
      return (
        <ErrorState
          title="Could not load this page"
          message={msg}
          onRetry={() => load(section)}
        />
      );
    }
    if (
      (section === "months" || section === "dashboard") &&
      msg &&
      !data.months.length
    ) {
      return (
        <ErrorState
          title="Could not load your data"
          message={msg}
          onRetry={() => load(section)}
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
            onNavigate={navigate}
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
              admin={admin}
              onCompleteMonth={admin ? completeMonth : null}
              onUndoCompleteMonth={admin ? undoCompleteMonth : null}
            />
            <MonthTab
              m={currentMonth!}
              flats={data.flats}
              pays={pays}
              admin={admin}
              superAdmin={superAdmin}
              hide={hide}
              settings={data.settings}
              ledger={data.corpusLedger}
              onSave={save}
              onClearAll={admin ? clearAllAmounts : null}
              onDelete={admin ? del : null}
              onCancelMonthTransfer={admin ? cancelMonthTransfer : null}
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
      case "service-contacts":
        return (
          <ServiceContacts
            settings={data.settings}
            admin={admin}
            onSave={save}
          />
        );
      case "visitor-access":
        return auth?.user.role === "user" ? (
          <SecurityDesk
            token={token}
            mode="resident"
            flats={data.flats}
            userFlat={auth?.user.flat || ""}
          />
        ) : null;
      case "security-desk":
        return auth?.user.role === "security" ? (
          <SecurityDesk token={token} mode="security" />
        ) : null;
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
            onNavigate={navigate}
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
      {showDemoNotice && auth && (
        <div className="modal-backdrop demo-notice-backdrop" role="presentation">
          <section
            className="card modal demo-notice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-notice-title"
          >
            <div className="confirm-dialog-icon" aria-hidden="true">i</div>
            <h2 id="demo-notice-title">Welcome to the Demo App!</h2>
            <p>
              This Apartment Association Portal is intended for demonstration
              purposes only.
            </p>
            <p>
              All data displayed in this application, including flat details,
              resident information, maintenance charges, payments, expenses,
              visitor records, and other transactions, may be sample or dummy
              data.
            </p>
            <p>
              Please do not rely on this information for actual financial
              transactions or official apartment association records.
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="pri"
                onClick={() => setShowDemoNotice(false)}
                autoFocus
              >
                Continue to Dashboard
              </button>
            </div>
          </section>
        </div>
      )}
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
          <Suspense fallback={null}>
            <ChangePassword
              token={token}
              onClose={() => setShowPassword(false)}
              onDone={() => {
                setShowPassword(false);
                logout();
              }}
            />
          </Suspense>
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
                    notify(`Export failed: ${errText(e)}`, "error");
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
                {admin && section === "months" && (
                  <button className="btn-primary" onClick={addMonth}>
                    + Add month
                  </button>
                )}
              </div>
            </div>
          )}
          <ErrorBoundary>
            <Suspense fallback={<LoadingState label="Loading…" />}>
              {renderContent()}
            </Suspense>
          </ErrorBoundary>
        </main>
        <footer className="app-footer">
          <div className="footer-content">
            <span>
              © {new Date().getFullYear()} {APP_BRAND_NAME}
            </span>
            <span className="footer-contact">
              If you have any questions, reach out to us at{" "}
              <a href="mailto:aisdsdsd@gmail.com">aisdsdsd@gmail.com</a>
            </span>
            <button
              type="button"
              className="footer-contact-button"
              onClick={() => void navigate("contact")}
            >
              Contact Us
            </button>
          </div>
        </footer>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        {[
          visibleNav.find((item) => item.id === "dashboard"),
          visibleNav.find((item) => item.id === "mymaintenance") ||
            visibleNav.find((item) => item.id === "months"),
          visibleNav.find((item) => item.id === "tickets"),
          visibleNav.find((item) => item.id === "hall") ||
            visibleNav.find((item) => item.id === "events"),
        ]
          .filter((item): item is (typeof visibleNav)[number] => Boolean(item))
          .filter(
            (item, index, items) =>
              items.findIndex((candidate) => candidate.id === item.id) ===
              index,
          )
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "active" : ""}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => void navigate(item.id)}
            >
              <span className="mobile-bottom-nav-icon">
                <NavIcon name={item.icon} />
              </span>
              <span>
                {item.id === "mymaintenance" ? "Payments" : item.label}
              </span>
            </button>
          ))}
      </nav>
    </div>
  );
}
