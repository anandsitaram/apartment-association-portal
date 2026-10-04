import Charts from "./Charts.jsx";
import { APP_BRAND_SHORT } from "../../../shared/branding";
import { useEffect, useMemo } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import type { Data, Flat } from "../../../shared/types";
import {
  buildSummary,
  fyLabel,
  inr,
  isDueDatePassed,
  dueDateText,
  label,
  mark,
  n2,
  sum,
  total,
  vsum,
} from "../../../shared/lib.js";
import Spinner from "../../components/Spinner.jsx";

const pct = (a: number, b: number) =>
  b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;

// Financial year starts in April; month keys use YYYY-MM.
const fyOfMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber >= 4 ? year : year - 1;
};

// One headline figure: collected vs due, with a progress bar.
// balance = due - collected: positive means still owed, negative means more was collected than was due (a surplus).
function Kpi({
  tone,
  title,
  collected,
  due,
  balance,
}: {
  tone: string;
  title: string;
  collected: number;
  due: number;
  balance: number;
}) {
  const p = pct(collected, due);
  const surplus = balance < -0.005;
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-title">{title}</span>
        <span className="kpi-pill">{p}%</span>
      </div>
      <div className="kpi-value">{inr(collected)}</div>
      <div className="kpi-bar">
        <i style={{ width: p + "%" }} />
      </div>
      <div className="kpi-foot">
        <span>Due {inr(due)}</span>
        <b>
          {surplus ? "Surplus" : "Balance"} {inr(Math.abs(balance))}
        </b>
      </div>
    </div>
  );
}

export default function Dashboard({
  data,
  flats,
  month,
  onMonthChange,
  onNavigate,
  admin,
  onAddMonth,
  loading,
}: {
  data: Data;
  flats: Flat[];
  month?: string;
  onMonthChange: (month: string) => void;
  onNavigate?: (section: string) => void;
  admin: boolean;
  onAddMonth?: (() => void) | null;
  loading: boolean;
}) {
  const [fy, setFy] = usePersistentState<number | null>(
    "rv_dashboard_fy",
    null,
  ); // null = all months
  // Build the all-month summary once. The FY-filtered view reuses it when possible,
  // avoiding two complete summary calculations during the initial Dashboard render.
  const all = useMemo(() => buildSummary(data, flats), [data, flats]);
  const filteredSummary = useMemo(
    () => (fy == null ? all : buildSummary(data, flats, fy)),
    [data, flats, fy, all],
  );
  // A remembered financial-year filter can become stale after data is imported,
  // months are deleted, or a different account signs in on this browser. Never
  // show the misleading "No monthly data yet" state when months actually exist.
  const invalidSavedFy =
    fy != null && filteredSummary.ms.length === 0 && all.ms.length > 0;
  useEffect(() => {
    if (invalidSavedFy) setFy(null);
  }, [invalidSavedFy, setFy]);
  const S = invalidSavedFy ? all : filteredSummary;
  // Deleted months remain in frozen financial history for reporting, but
  // should not be selected as the current month on the Dashboard.
  const liveMonthKeys = new Set(data.months.map((m) => m.month));
  const selected =
    (month && liveMonthKeys.has(month)
      ? all.ms.find((m) => m.month === month)
      : undefined) ||
    all.ms.filter((m) => liveMonthKeys.has(m.month)).at(-1) ||
    all.ms.at(-1);
  if (loading) return <Spinner />;
  if (!selected || !S.ms.length) {
    return (
      <div className="empty-state">
        <h2>No monthly data yet</h2>
        <p>
          {admin
            ? "Create the first month (with its expenses) to start recording maintenance payments, and this overview will fill in automatically."
            : "The admin hasn't added a month yet. Check back once maintenance payments start being recorded."}
        </p>
        {admin && onAddMonth && (
          <button className="btn-primary" onClick={onAddMonth}>
            + Add month
          </button>
        )}
      </div>
    );
  }

  // ---- overall figures for the chosen period (all months, or one financial year) ----
  const per = S.ms.map((v) => {
    // Every month uses combined Maintenance + Corp Fund figures for the
    // dashboard collection and due totals. Corp Fund amounts are already zero
    // for months where Corp Fund is not applicable.
    const due = vsum(v.due) + vsum(v.cdue);
    const paid = vsum(v.paid) + vsum(v.cpaid);
    return {
      v,
      exp: total(v),
      due,
      paid,
      bal: due - paid,
    };
  });
  const T = (k: "exp" | "due" | "paid" | "bal") => sum(per, (r) => r[k]);
  const firstMonthLabel = label(S.ms[0]!.month);
  const lastMonthLabel = label(S.ms.at(-1)!.month);
  const range =
    firstMonthLabel === lastMonthLabel
      ? firstMonthLabel
      : `${firstMonthLabel} – ${lastMonthLabel}`;
  // Explain that the selector filters the dashboard totals by all available
  // months or by financial year; the flat-wise section separately shows the
  // currently selected month.
  const periodDescription =
    fy == null
      ? `Totals: All available months · ${range}${S.ms.length === 1 ? " (1 month)" : ` (${S.ms.length} months)`}`
      : `Totals: Financial year ${fyLabel(fy)} · ${range}`;
  // Period totals consistently combine Maintenance + Corp Fund for every month.
  const dashboardDue = T("due");
  const dashboardPaid = T("paid");
  const dashboardBalance = dashboardDue - dashboardPaid;
  const now = Date.now();
  const upcomingHall = (data.hallBookings || [])
    .filter(
      (b) =>
        new Date(b.starts_at).getTime() >= now &&
        b.status !== "cancelled" &&
        b.status !== "rejected",
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const upcomingGym = (data.gymBookings || [])
    .filter(
      (b) =>
        new Date(b.starts_at).getTime() >= now &&
        b.status !== "cancelled" &&
        b.status !== "rejected",
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const upcomingEvents = (data.events || [])
    .filter((e) => new Date(e.starts_at).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const openTickets = (data.tickets || []).filter(
    (t) => t.status !== "resolved" && t.status !== "rejected",
  );
  const openPolls = (data.polls || []).filter((p) => p.status === "open");
  const shortDate = (value?: string | null) => {
    if (!value) return "Date not set";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Date not set"
      : date.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  };

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="eyebrow">{APP_BRAND_SHORT} · OVERVIEW</div>
          <h1>Monthly Maintenance Overview</h1>
          <p>{periodDescription}</p>
        </div>
        <label className="dash-select">
          <span>Totals period</span>
          <select
            aria-label="Select period"
            value={fy ?? "all"}
            onChange={(e) =>
              setFy(e.target.value === "all" ? null : +e.target.value)
            }
          >
            <option value="all">All available months</option>
            {S.years.map((y) => (
              <option key={y} value={y}>
                Financial year {fyLabel(y)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="month-section-note" style={{ marginBottom: 16 }}>
        <div>
          <h3>Monthly process</h3>
          <p className="muted">
            Track combined Maintenance + Corp Fund charges and collections,
            alongside actual expenses.
          </p>
        </div>
      </div>

      {isDueDatePassed(selected.month, data.settings.dueDay) && (
        <div className="due-date-notice" role="status">
          Payment due date ({dueDateText(selected.month, data.settings.dueDay)})
          has passed. Please review the Months page for outstanding balances.
        </div>
      )}

      <div className="kpi-grid">
        <Kpi
          tone="green"
          title="Maintenance + Corp Fund collected"
          collected={dashboardPaid}
          due={dashboardDue}
          balance={dashboardBalance}
        />
        <div className="kpi kpi-plain kpi-amber">
          <span className="kpi-title">
            Maintenance + Corp Fund pending from flats
          </span>
          <div className="kpi-value">{inr(dashboardBalance)}</div>
          <div className="kpi-note">
            {"Maintenance + Corp Fund pending for the selected period"}
          </div>
        </div>
      </div>

      <Charts
        points={per.map((r) => ({
          month: r.v.month,
          due: r.due,
          paid: r.paid,
          expenses: r.v.expenses || [],
        }))}
      />

      {admin &&
        (() => {
          const carryMonths = data.months
            .filter(
              (item) =>
                (fy == null || fyOfMonth(item.month) === fy) &&
                item.notes?.carryForward &&
                Object.keys(item.notes.carryForward).length > 0,
            )
            .sort((a, b) => a.month.localeCompare(b.month));
          if (!carryMonths.length) return null;
          const carriedTotal = carryMonths.reduce(
            (grand, item) =>
              grand +
              Object.values(item.notes?.carryForward || {}).reduce(
                (subtotal, amount) =>
                  subtotal +
                  (Number(amount?.maintenance) || 0) +
                  (Number(amount?.corp) || 0),
                0,
              ),
            0,
          );
          const carriedFlatMonths = carryMonths.reduce(
            (count, item) =>
              count + Object.keys(item.notes?.carryForward || {}).length,
            0,
          );
          return (
            <section
              className="dashboard-card"
              aria-label="Carried-forward flat details"
            >
              <div className="dashboard-card-head">
                <div>
                  <h2>Carried-forward flat details</h2>
                  <p>
                    Total {inr(carriedTotal)} across {carriedFlatMonths}{" "}
                    flat-month entries. Calculation: Maintenance arrears + Corp
                    Fund arrears; combined arrears are stored in Maintenance.
                  </p>
                </div>
              </div>
              {carryMonths.map((item) => {
                const [year, monthNumber] = item.month.split("-").map(Number);
                const sourceMonth = label(
                  `${year - (monthNumber === 1 ? 1 : 0)}-${String(monthNumber === 1 ? 12 : monthNumber - 1).padStart(2, "0")}`,
                );
                const entries = Object.entries(
                  item.notes?.carryForward || {},
                ).sort(([a], [b]) =>
                  a.localeCompare(b, undefined, { numeric: true }),
                );
                const monthTotal = entries.reduce(
                  (subtotal, [, amount]) =>
                    subtotal +
                    (Number(amount?.maintenance) || 0) +
                    (Number(amount?.corp) || 0),
                  0,
                );
                const maintenanceTotal = entries.reduce(
                  (subtotal, [, amount]) =>
                    subtotal + (Number(amount?.maintenance) || 0),
                  0,
                );
                const corpTotal = entries.reduce(
                  (subtotal, [, amount]) =>
                    subtotal + (Number(amount?.corp) || 0),
                  0,
                );
                return (
                  <details key={item.month} style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                      {label(item.month)} — carried forward since {sourceMonth}{" "}
                      — {inr(monthTotal)} across {entries.length} flat(s)
                    </summary>
                    <div className="report-table-wrap" style={{ marginTop: 8 }}>
                      <table className="report-table wide">
                        <thead>
                          <tr>
                            <th className="text">Flat</th>
                            <th className="text">Flat name</th>
                            <th>Maintenance arrears</th>
                            <th>Corp Fund arrears</th>
                            <th>Total carried forward</th>
                            <th className="text">Calculation type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(([flatNo, amount]) => {
                            const flatInfo = flats.find(
                              (flat) => flat.flat === flatNo,
                            );
                            const maintenance =
                              Number(amount?.maintenance) || 0;
                            const corp = Number(amount?.corp) || 0;
                            return (
                              <tr key={flatNo}>
                                <td className="text">
                                  <b>{flatNo}</b>
                                </td>
                                <td className="text">
                                  {flatInfo?.name || "—"}
                                </td>
                                <td>{n2(maintenance)}</td>
                                <td>{n2(corp)}</td>
                                <td>
                                  <b>{n2(maintenance + corp)}</b>
                                </td>
                                <td className="text">
                                  {amount?.combined
                                    ? "Combined arrears (in Maintenance)"
                                    : "Separate Maintenance + Corp Fund"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="text" colSpan={2}>
                              <b>Month total</b>
                            </td>
                            <td>
                              <b>{n2(maintenanceTotal)}</b>
                            </td>
                            <td>
                              <b>{n2(corpTotal)}</b>
                            </td>
                            <td>
                              <b>{n2(monthTotal)}</b>
                            </td>
                            <td className="text">Sum of flat totals</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </details>
                );
              })}
            </section>
          );
        })()}

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Month-wise summary</h2>
            <p>
              Combined Maintenance + Corp Fund due and collected for every
              month, with actual expenses shown separately.
            </p>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table wide month-table">
            <thead>
              <tr>
                <th className="text">Month</th>
                <th>Actual expenses</th>
                <th>Maintenance + Corp Fund due</th>
                <th>Maintenance + Corp Fund collected</th>
                <th className="text">Collection progress</th>
              </tr>
            </thead>
            <tbody>
              {per.map((r) => (
                <tr
                  key={r.v.month}
                  className={
                    "clickable" +
                    (r.v.month === selected.month ? " selected" : "") +
                    (r.bal > 0.005 ? " has-outstanding" : "")
                  }
                  onClick={() => onMonthChange?.(r.v.month)}
                >
                  <td className="text flat-cell">
                    <span>{mark(r.v)}</span>
                    <span className="summary-chip">Maint. + Corp</span>
                  </td>
                  <td>{n2(r.exp)}</td>
                  <td>{n2(r.due)}</td>
                  <td>{n2(r.paid)}</td>
                  <td className="text">
                    <span className="mbar">
                      <i
                        style={{
                          width: pct(r.paid, r.due) + "%",
                        }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="text">Total · selected period</td>
                <td>{n2(T("exp"))}</td>
                <td>{n2(T("due"))}</td>
                <td>{n2(T("paid"))}</td>
                <td className="text">
                  <span className="mbar">
                    <i style={{ width: pct(T("paid"), T("due")) + "%" }} />
                  </span>
                  <small className="summary-total-percent">
                    {pct(T("paid"), T("due"))}% collected
                  </small>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Community quick view</h2>
            <p>
              Upcoming bookings, community events, and items needing attention
            </p>
          </div>
        </div>
        <div className="dashboard-quick-grid">
          <div className="dashboard-quick-card dashboard-quick-card-static">
            <span className="dashboard-quick-icon">💰</span>
            <span className="dashboard-quick-title">Total Expenses</span>
            <strong>{inr(T("exp"))}</strong>
            <small>For the selected totals period</small>
          </div>
          {data.features?.hallBooking !== false && (
            <button
              className="dashboard-quick-card"
              onClick={() => onNavigate?.("hall")}
            >
              <span className="dashboard-quick-icon">🏛️</span>
              <span className="dashboard-quick-title">Party Hall</span>
              <strong>{upcomingHall.length} upcoming</strong>
              <small>
                {upcomingHall[0]
                  ? `${upcomingHall[0].title} · ${shortDate(upcomingHall[0].starts_at)}`
                  : "No upcoming bookings"}
              </small>
            </button>
          )}
          {data.features?.events !== false && (
            <button
              className="dashboard-quick-card"
              onClick={() => onNavigate?.("events")}
            >
              <span className="dashboard-quick-icon">📅</span>
              <span className="dashboard-quick-title">Community Events</span>
              <strong>{upcomingEvents.length} upcoming</strong>
              <small>
                {upcomingEvents[0]
                  ? `${upcomingEvents[0].title} · ${shortDate(upcomingEvents[0].starts_at)}`
                  : "No upcoming events"}
              </small>
            </button>
          )}
          {data.features?.tickets !== false && (
            <button
              className="dashboard-quick-card"
              onClick={() => onNavigate?.("tickets")}
            >
              <span className="dashboard-quick-icon">🎫</span>
              <span className="dashboard-quick-title">Tickets</span>
              <strong>{openTickets.length} open</strong>
              <small>Requests that still need attention</small>
            </button>
          )}
          {data.features?.gymBooking !== false && (
            <button
              className="dashboard-quick-card"
              onClick={() => onNavigate?.("gym")}
            >
              <span className="dashboard-quick-icon">🏋️</span>
              <span className="dashboard-quick-title">Gym Booking</span>
              <strong>{upcomingGym.length} upcoming</strong>
              <small>
                {upcomingGym[0]
                  ? `${upcomingGym[0].title} · ${shortDate(upcomingGym[0].starts_at)}`
                  : "No upcoming bookings"}
              </small>
            </button>
          )}
          {data.features?.polls !== false && (
            <button
              className="dashboard-quick-card"
              onClick={() => onNavigate?.("polls")}
            >
              <span className="dashboard-quick-icon">🗳️</span>
              <span className="dashboard-quick-title">Polls & Surveys</span>
              <strong>{openPolls.length} open</strong>
              <small>Share your feedback and vote</small>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
