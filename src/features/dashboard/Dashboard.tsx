import Charts from "./Charts.jsx";
import { APP_BRAND_SHORT } from "../../../shared/branding";
import { useMemo } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import type { Data, Flat, Month, PerFlat } from "../../../shared/types";
import {
  buildSummary,
  fyLabel,
  inr,
  isMaintExcluded,
  isDueDatePassed,
  dueDateText,
  label,
  mark,
  n2,
  sum,
  total,
  vsum,
} from "../../lib.js";
import Spinner from "../../components/Spinner.jsx";

const pct = (a: number, b: number) =>
  b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;

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
  admin,
  onAddMonth,
  loading,
}: {
  data: Data;
  flats: Flat[];
  month?: string;
  onMonthChange: (month: string) => void;
  admin: boolean;
  onAddMonth?: (() => void) | null;
  loading: boolean;
}) {
  const [fy, setFy] = usePersistentState<number | null>(
    "rv_dashboard_fy",
    null,
  ); // null = all months
  const [statusFilter, setStatusFilter] = usePersistentState<
    "all" | "paid" | "part" | "unpaid" | "excluded"
  >("all", "all");
  // Build the all-month summary once. The FY-filtered view reuses it when possible,
  // avoiding two complete summary calculations during the initial Dashboard render.
  const all = useMemo(() => buildSummary(data, flats), [data, flats]);
  const S = useMemo(
    () => (fy == null ? all : buildSummary(data, flats, fy)),
    [data, flats, fy, all],
  );
  const selected = all.ms.find((m) => m.month === month) || all.ms.at(-1);
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
    const due = vsum(v.due),
      paid = vsum(v.paid),
      cdue = vsum(v.cdue),
      cpaid = vsum(v.cpaid);
    return {
      v,
      exp: total(v),
      due,
      paid,
      bal: due - paid,
      cdue,
      cpaid,
      cbal: cdue - cpaid,
    };
  });
  const T = (k: "exp" | "due" | "paid" | "bal" | "cdue" | "cpaid" | "cbal") =>
    sum(per, (r) => r[k]);
  const firstMonthLabel = label(S.ms[0]!.month);
  const lastMonthLabel = label(S.ms.at(-1)!.month);
  const range =
    firstMonthLabel === lastMonthLabel
      ? firstMonthLabel
      : `${firstMonthLabel} – ${lastMonthLabel}`;
  // Avoid the confusing "All months · Sept 2026 – Sept 2026" when there is
  // only one month in the dataset. Keep the range when multiple months exist.
  const periodDescription =
    fy == null && S.ms.length === 1
      ? firstMonthLabel
      : `${fy == null ? "All months" : fyLabel(fy)} · ${range}`;

  // ---- flat-wise table for the selected month ----
  const at = (obj: PerFlat | undefined, flat: string) =>
    +(obj?.[flat] ?? 0) || 0;
  const cumulative = Object.fromEntries(all.rows.map((r) => [r.f.flat, r]));
  // this month's own due/paid (as opposed to `r.due`/`r.paid`, which are cumulative totals to date), for the
  // Status column: the same rule the Months tab uses for its paid / partly paid / unpaid dot.
  const monthRecord: Month | undefined = data.months.find(
    (mm) => mm.month === selected.month,
  );
  type Status = "paid" | "part" | "unpaid" | "excluded";
  const statusOf = (f: Flat, due: number, paid: number): Status => {
    if (monthRecord ? isMaintExcluded(monthRecord, f) : due <= 0)
      return "excluded";
    if (due > 0 && paid - due > -0.005) return "paid";
    return paid > 0 ? "part" : "unpaid";
  };
  const rows = flats.map((f) => {
    const r = cumulative[f.flat] || { paid: 0, due: 0, cd: 0, cpd: 0 };
    const thisDue = at(selected.due, f.flat) + at(selected.cdue, f.flat),
      thisPaid = at(selected.paid, f.flat) + at(selected.cpaid, f.flat);
    return {
      flat: f.flat,
      currentPaid: at(selected.paid, f.flat),
      paid: r.paid,
      due: r.due,
      outstanding: r.due - r.paid,
      corpDue: r.cd,
      corpPaid: r.cpd,
      corpBalance: r.cd - r.cpd,
      status: statusOf(f, thisDue, thisPaid),
    };
  });
  const visibleRows =
    statusFilter === "all"
      ? rows
      : rows.filter((r) => r.status === statusFilter);
  const rt = (
    key:
      | "currentPaid"
      | "paid"
      | "due"
      | "outstanding"
      | "corpDue"
      | "corpPaid"
      | "corpBalance",
  ) => sum(rows, (r) => r[key]);
  const clear = rows.filter((r) => r.outstanding <= 0.005).length;

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="eyebrow">{APP_BRAND_SHORT} · OVERVIEW</div>
          <h1>Maintenance &amp; Corpus Fund</h1>
          <p>{periodDescription}</p>
        </div>
        <label className="dash-select">
          <span>Period</span>
          <select
            aria-label="Select period"
            value={fy ?? "all"}
            onChange={(e) =>
              setFy(e.target.value === "all" ? null : +e.target.value)
            }
          >
            <option value="all">All months</option>
            {S.years.map((y) => (
              <option key={y} value={y}>
                {fyLabel(y)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isDueDatePassed(selected.month, data.settings.dueDay) && (
        <div className="due-date-notice" role="status">
          Payment due date ({dueDateText(selected.month, data.settings.dueDay)})
          has passed. Unpaid and partly paid flats are highlighted below.
        </div>
      )}

      <div className="kpi-grid">
        <Kpi
          tone="green"
          title="Maintenance collected"
          collected={T("paid")}
          due={T("due")}
          balance={T("bal")}
        />
        <Kpi
          tone="purple"
          title="Corpus fund collected"
          collected={T("cpaid")}
          due={T("cdue")}
          balance={T("cbal")}
        />
        <div className="kpi kpi-plain kpi-amber">
          <span className="kpi-title">Balance maintenance</span>
          <div className="kpi-value">{inr(T("bal"))}</div>
          <div className="kpi-note">
            Still to be collected across {S.ms.length} month
            {S.ms.length > 1 ? "s" : ""}
          </div>
        </div>
        <div className="kpi kpi-plain kpi-rose">
          <span className="kpi-title">Balance corpus fund</span>
          <div className="kpi-value">{inr(T("cbal"))}</div>
          <div className="kpi-note">Corpus fund still pending from flats</div>
        </div>
      </div>

      <div className="mini-grid">
        <div className="mini">
          <span>Total expenses</span>
          <b>{inr(T("exp"))}</b>
        </div>
        <div className="mini">
          <span>Total money collected</span>
          <b>{inr(T("paid") + T("cpaid"))}</b>
        </div>
        <div className="mini">
          <span>Total balance</span>
          <b>{inr(T("bal") + T("cbal"))}</b>
        </div>
        <div className="mini">
          <span>Flats fully cleared</span>
          <b>
            {clear} / {rows.length}
          </b>
        </div>
      </div>

      <Charts
        points={per.map((r) => ({
          month: r.v.month,
          due: r.due,
          paid: r.paid,
          cdue: r.cdue,
          cpaid: r.cpaid,
          expenses: r.v.expenses || [],
        }))}
      />

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Month-wise summary</h2>
            <p>Click a month to see flat-wise status below</p>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table wide month-table">
            <thead>
              <tr>
                <th className="text">Month</th>
                <th>Expenses</th>
                <th>Maint. Due</th>
                <th>Maint. Collected</th>
                <th>Maint. Balance</th>
                <th>Corp Due</th>
                <th>Corp Collected</th>
                <th>Corp Balance</th>
                <th>Total Due</th>
                <th>Total Collected</th>
                <th className="text">Collected</th>
              </tr>
            </thead>
            <tbody>
              {per.map((r) => (
                <tr
                  key={r.v.month}
                  className={
                    "clickable" +
                    (r.v.month === selected.month ? " selected" : "") +
                    (r.bal + r.cbal > 0.005 ? " has-outstanding" : "")
                  }
                  onClick={() => onMonthChange?.(r.v.month)}
                >
                  <td className="text flat-cell">{mark(r.v)}</td>
                  <td>{n2(r.exp)}</td>
                  <td>{n2(r.due)}</td>
                  <td>{n2(r.paid)}</td>
                  <td className="strong-number">{n2(r.bal)}</td>
                  <td>{n2(r.cdue)}</td>
                  <td>{n2(r.cpaid)}</td>
                  <td className="strong-number">{n2(r.cbal)}</td>
                  <td>{n2(r.due + r.cdue)}</td>
                  <td>{n2(r.paid + r.cpaid)}</td>
                  <td className="text">
                    <span className="mbar">
                      <i
                        style={{
                          width: pct(r.paid + r.cpaid, r.due + r.cdue) + "%",
                        }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="text">Total</td>
                <td>{n2(T("exp"))}</td>
                <td>{n2(T("due"))}</td>
                <td>{n2(T("paid"))}</td>
                <td className="strong-number">{n2(T("bal"))}</td>
                <td>{n2(T("cdue"))}</td>
                <td>{n2(T("cpaid"))}</td>
                <td className="strong-number">{n2(T("cbal"))}</td>
                <td>{n2(T("due") + T("cdue"))}</td>
                <td>{n2(T("paid") + T("cpaid"))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Flat-wise status</h2>
            <p>
              {label(selected.month)} payments, with running totals up to date
            </p>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="dashboard-date">
              <select
                aria-label="Select month"
                value={selected.month}
                onChange={(e) => onMonthChange?.(e.target.value)}
              >
                {all.ms.map((m) => (
                  <option key={m.month} value={m.month}>
                    {label(m.month)}
                  </option>
                ))}
              </select>
            </label>
            <label className="dashboard-date">
              <select
                aria-label="Filter by payment status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | Status)
                }
              >
                <option value="all">All ({rows.length})</option>
                <option value="paid">
                  Fully paid ({rows.filter((r) => r.status === "paid").length})
                </option>
                <option value="part">
                  Partly paid ({rows.filter((r) => r.status === "part").length})
                </option>
                <option value="unpaid">
                  Unpaid ({rows.filter((r) => r.status === "unpaid").length})
                </option>
                {rows.some((r) => r.status === "excluded") && (
                  <option value="excluded">
                    Excluded (
                    {rows.filter((r) => r.status === "excluded").length})
                  </option>
                )}
              </select>
            </label>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table wide flat-status-table">
            <colgroup>
              <col className="col-flat" />
              <col />
              {Array.from({ length: 10 }, (_, i) => (
                <col key={i} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="text">Flat</th>
                <th className="text">Status</th>
                <th>{label(selected.month)} Paid</th>
                <th>Total Paid</th>
                <th>Total Due</th>
                <th>Outstanding</th>
                <th>Corp Due</th>
                <th>Corp Paid</th>
                <th>Corp Balance</th>
                <th>Total Due (Maint + Corp)</th>
                <th>Total Paid (Maint + Corp)</th>
                <th>Total Balance</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.flat} className={r.status}>
                  <td className="text flat-cell">{r.flat}</td>
                  <td className="text">
                    <i className={`dot ${r.status}`} />{" "}
                    {r.status === "paid"
                      ? "Fully paid"
                      : r.status === "part"
                        ? "Partly paid"
                        : r.status === "excluded"
                          ? "Excluded"
                          : "Unpaid"}
                  </td>
                  <td>{n2(r.currentPaid)}</td>
                  <td>{n2(r.paid)}</td>
                  <td>{n2(r.due)}</td>
                  <td className="strong-number">{n2(r.outstanding)}</td>
                  <td>{n2(r.corpDue)}</td>
                  <td>{n2(r.corpPaid)}</td>
                  <td>{n2(r.corpBalance)}</td>
                  <td>{n2(r.due + r.corpDue)}</td>
                  <td>{n2(r.paid + r.corpPaid)}</td>
                  <td className="strong-number">
                    {n2(r.outstanding + r.corpBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="text">Total</td>
                <td className="text">
                  {statusFilter === "all"
                    ? ""
                    : `${visibleRows.length} of ${rows.length} shown`}
                </td>
                <td>{n2(rt("currentPaid"))}</td>
                <td>{n2(rt("paid"))}</td>
                <td>{n2(rt("due"))}</td>
                <td className="strong-number">{n2(rt("outstanding"))}</td>
                <td>{n2(rt("corpDue"))}</td>
                <td>{n2(rt("corpPaid"))}</td>
                <td className="strong-number">{n2(rt("corpBalance"))}</td>
                <td>{n2(rt("due") + rt("corpDue"))}</td>
                <td>{n2(rt("paid") + rt("corpPaid"))}</td>
                <td className="strong-number">
                  {n2(rt("outstanding") + rt("corpBalance"))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
