import { useState, type ReactNode } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import type { Data, Flat, PerFlat, Settings } from "../../../shared/types";
import type { Save } from "../../api.js";
import { exportSummary } from "../../export.js";
import {
  buildSummary,
  fyLabel,
  inr,
  label,
  mark,
  n2,
  sum,
  total,
} from "../../lib.js";
import { notify } from "../../components/ui/ToastHost.jsx";
import { SHEAD, SNUM } from "../../columns.js";
import ColumnsPanel from "../../components/ColumnsPanel.jsx";
import Spinner from "../../components/Spinner.jsx";

function MyAccount({
  S,
  flat,
}: {
  S: ReturnType<typeof buildSummary>;
  flat: Flat;
}) {
  const at = (o?: PerFlat) => +(o?.[flat.flat] ?? 0) || 0;
  const rows = S.ms.map((v) => ({
    v,
    due: at(v.due),
    paid: at(v.paid),
    cd: at(v.cdue),
    cpd: at(v.cpaid),
  }));
  const T = (k: "due" | "paid" | "cd" | "cpd") => sum(rows, (r) => r[k]);
  return (
    <>
      <h2>
        YOUR ACCOUNT – FLAT {flat.flat}
        {flat.name ? ` (${flat.name})` : ""}
      </h2>
      <div className="stats">
        {[
          ["Maintenance due", T("due")],
          ["Maintenance paid", T("paid")],
          ["Outstanding", T("due") - T("paid")],
          ["Corp Fund due", T("cd")],
          ["Corp Fund paid", T("cpd")],
        ].map(([k, v]) => (
          <div className="card" key={k}>
            <span className="muted">{k}</span>
            <b>{inr(v)}</b>
          </div>
        ))}
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Maint. Due</th>
              <th>Maint. Paid</th>
              <th>Outstanding</th>
              <th>Corp Due</th>
              <th>Corp Paid</th>
              <th>Corp Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.v.month}
                className={r.due - r.paid > 0.005 ? "unpaid" : "paid"}
              >
                <td>{mark(r.v)}</td>
                <td className="r">{n2(r.due)}</td>
                <td className="r">{n2(r.paid)}</td>
                <td className="r">
                  <b>{n2(r.due - r.paid)}</b>
                </td>
                <td className="r">{n2(r.cd)}</td>
                <td className="r">{n2(r.cpd)}</td>
                <td className="r">{n2(r.cd - r.cpd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td className="r">{n2(T("due"))}</td>
              <td className="r">{n2(T("paid"))}</td>
              <td className="r">{n2(T("due") - T("paid"))}</td>
              <td className="r">{n2(T("cd"))}</td>
              <td className="r">{n2(T("cpd"))}</td>
              <td className="r">{n2(T("cd") - T("cpd"))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {S.kept.length > 0 && (
        <p className="legend">
          † Month deleted – its figures are kept exactly as they were when it
          was deleted.
        </p>
      )}
    </>
  );
}

export default function Summary({
  data,
  flats,
  hide,
  admin,
  settings,
  onSave,
  loading,
  mine,
  residentOnly,
}: {
  data: Data;
  flats: Flat[];
  hide: boolean;
  admin: boolean;
  settings: Settings;
  onSave: Save;
  loading: boolean;
  mine: string | null;
  residentOnly: boolean;
}) {
  const [showCols, setShowCols] = useState(false);
  const [fy, setFy] = usePersistentState<number | null>("rv_summary_fy", null); // null = all years
  if (loading) return <Spinner />;
  const S = buildSummary(data, flats, fy);
  const { ms, kept, acc, rows, descs, cf, dueAll, paidAll } = S;
  if (residentOnly) {
    const flat = flats.find((f) => f.flat === mine);
    return flat ? (
      <MyAccount S={S} flat={flat} />
    ) : (
      <p className="muted">
        No flat is linked to your account yet. Please ask an admin to link your
        login to your flat.
      </p>
    );
  }
  if (!ms.length)
    return (
      <p className="muted">
        No months yet. Log in as admin and add one with the + tab.
      </p>
    );
  type SRow = (typeof rows)[number];
  const T = (fn: (r: SRow) => number) => n2(sum(rows, fn));
  // Names are shown to admins only. Hidden / renamed columns come from the admin's column settings.
  const hiddenS = new Set(settings.hidden || []);
  const sl = (k: string) => settings.labels?.[k] || SHEAD[k];
  const scols = Object.keys(SHEAD).filter(
    (k) => k === "s_flat" || (!hiddenS.has(k) && (k !== "s_name" || admin)),
  );
  const cls = (k: string) =>
    (k === "s_sl" ? "hm " : "") + (SNUM.includes(k) ? "r" : "");
  const body = (r: SRow): Record<string, ReactNode> => ({
    s_sl: r.f.sl,
    s_name: hide ? "••••" : r.f.name || "—",
    s_flat: <b>{r.f.flat}</b>,
    s_paid: n2(r.paid),
    s_due: n2(r.due),
    s_out: <b>{n2(r.due - r.paid)}</b>,
    s_cd: n2(r.cd),
    s_cpd: n2(r.cpd),
    s_cb: n2(r.cd - r.cpd),
  });
  const foot: Record<string, string> = {
    s_flat: "GRAND TOTAL",
    s_paid: T((r) => r.paid),
    s_due: T((r) => r.due),
    s_out: T((r) => r.due - r.paid),
    s_cd: T((r) => r.cd),
    s_cpd: T((r) => r.cpd),
    s_cb: T((r) => r.cd - r.cpd),
  };
  return (
    <>
      <div className="row titlebar">
        <h2>
          MAINTENANCE PAYMENT SUMMARY –{" "}
          {fy != null
            ? fyLabel(fy).toUpperCase()
            : S.years.length === 1
              ? fyLabel(S.years[0]!).toUpperCase()
              : `${fyLabel(S.years[0]!).toUpperCase()} TO ${fyLabel(S.years.at(-1)!).toUpperCase()}`}
        </h2>
        <span className="acts no-print">
          <select
            className="period-select"
            aria-label="Select period"
            value={fy ?? "all"}
            onChange={(e) =>
              setFy(e.target.value === "all" ? null : +e.target.value)
            }
          >
            <option value="all">All years</option>
            {S.years.map((y) => (
              <option key={y} value={y}>
                {fyLabel(y)}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              exportSummary({ summary: S, settings, admin, hide }).catch((e) =>
                notify("Export failed: " + e.message, "error"),
              )
            }
          >
            ⬇ Excel
          </button>
          <button onClick={() => window.print()}>🖨 Print / PDF</button>
          {admin && (
            <button onClick={() => setShowCols(!showCols)}>⚙ Columns</button>
          )}
        </span>
      </div>
      {showCols && (
        <ColumnsPanel
          scope="summary"
          settings={settings}
          onSave={onSave}
          onClose={() => setShowCols(false)}
        />
      )}
      <div className="stats">
        {[
          ["Total expenses", sum(ms, total)],
          ["Maintenance due", dueAll],
          ["Collected", paidAll],
          ["Outstanding", dueAll - paidAll],
          ["Corp Fund collected", sum(rows, (r) => r.cpd)],
          ["Shortfall carried fwd", cf],
        ].map(([k, v]) => (
          <div className="card" key={k}>
            <span className="muted">{k}</span>
            <b>{inr(v)}</b>
          </div>
        ))}
      </div>
      <h3>▶ Payments by flat</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {scols.flatMap((k) =>
                k === "s_months"
                  ? ms.map((v) => (
                      <th key={"m" + v.month}>
                        {mark(v)} {sl(k)}
                      </th>
                    ))
                  : [
                      <th key={k} className={cls(k)}>
                        {sl(k)}
                      </th>,
                    ],
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = body(r);
              return (
                <tr
                  key={r.f.flat}
                  className={r.due - r.paid > 0.005 ? "unpaid" : "paid"}
                >
                  {scols.flatMap((k) =>
                    k === "s_months"
                      ? r.cells.map((c, i) => (
                          <td className="r" key={"m" + i}>
                            {n2(c)}
                          </td>
                        ))
                      : [
                          <td key={k} className={cls(k)}>
                            {b[k]}
                          </td>,
                        ],
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              {scols.flatMap((k) =>
                k === "s_months"
                  ? acc.map((a) => (
                      <td className="r" key={"m" + a.m.month}>
                        {n2(a.paid)}
                      </td>
                    ))
                  : [
                      <td key={k} className={cls(k)}>
                        {foot[k] ?? ""}
                      </td>,
                    ],
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      <h3>▶ Total expenses – month by month</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              {descs.map((d) => (
                <th key={d}>{d}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ms.map((v) => (
              <tr key={v.month}>
                <td>{mark(v)}</td>
                {descs.map((d) => (
                  <td className="r" key={d}>
                    {n2(
                      sum(
                        v.expenses.filter((e) => e.description === d),
                        (e) => +e.amount,
                      ),
                    )}
                  </td>
                ))}
                <td className="r">
                  <b>{n2(total(v))}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>▶ Shortfall carried forward – month by month</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Total Maint. Due</th>
              <th>Total Actual Paid</th>
              <th>Shortfall This Month</th>
              <th>Shortfall Carried Fwd</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {acc.map((a) => (
              <tr key={a.m.month}>
                <td>{mark(a.m)}</td>
                <td className="r">{n2(a.due)}</td>
                <td className="r">{n2(a.paid)}</td>
                <td className="r">{n2(a.short)}</td>
                <td className="r">
                  <b>{n2(a.cf)}</b>
                </td>
                <td>{a.note}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                ★ FINAL SHORTFALL CARRIED FWD (After {label(ms.at(-1)!.month)})
              </td>
              <td className="r">{n2(cf)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {kept.length > 0 && (
        <p className="legend">
          † Month deleted – its figures are kept in this summary exactly as they
          were when it was deleted.
        </p>
      )}
    </>
  );
}
