import { useMemo } from "react";
import { usePersistentState } from "../usePersistentState.js";
import type { Data } from "../../shared/types";
import { buildSummary, inr, label, n2 } from "../lib.js";
import { printFlatStatement, printReceipt } from "../print-doc.js";

const at = (o: Record<string, number> | undefined, k: string) =>
  +(o?.[k] ?? 0) || 0;

export default function MyMaintenance({
  data,
  flat,
}: {
  data: Data;
  flat: string | null;
}) {
  const [range, setRange] = usePersistentState<3 | 6>(
    "rv_my_maintenance_range",
    6,
  );

  const S = useMemo(() => buildSummary(data, data.flats), [data]);
  const payByMonth = useMemo(() => {
    const m = new Map<string, (typeof data.payments)[number]>();
    for (const p of data.payments) if (p.flat === flat) m.set(p.month, p);
    return m;
  }, [data.payments, flat]);

  const rows = S.ms
    .slice(-range)
    .map((v) => {
      const due = at(v.due, flat || ""),
        paid = at(v.paid, flat || ""),
        cdue = at(v.cdue, flat || ""),
        cpaid = at(v.cpaid, flat || "");
      const totalDue = due + cdue,
        totalPaid = paid + cpaid;
      const status =
        totalDue <= 0
          ? "excluded"
          : totalPaid + 0.005 >= totalDue
            ? "paid"
            : totalPaid > 0
              ? "part"
              : "unpaid";
      return {
        month: v.month,
        due,
        paid,
        cdue,
        cpaid,
        totalDue,
        totalPaid,
        status,
      };
    })
    .reverse();

  const totalDue = rows.reduce((s, r) => s + r.totalDue, 0);
  const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
  const outstanding = totalDue - totalPaid;

  if (!flat) {
    return (
      <div className="empty-state">
        <h2>No flat linked to your login</h2>
        <p>
          Ask the MC to link your login to your flat to see your maintenance
          record here.
        </p>
      </div>
    );
  }

  return (
    <div className="dash">
      <div className="kpi-grid">
        <div className="mini">
          <span>Flat</span>
          <b>{flat}</b>
        </div>
        <div className="mini">
          <span>Total due (last {range} mo.)</span>
          <b>{inr(totalDue)}</b>
        </div>
        <div className="mini">
          <span>Total paid</span>
          <b>{inr(totalPaid)}</b>
        </div>
        <div
          className={`kpi kpi-plain ${outstanding > 0.005 ? "kpi-orange" : "kpi-green"}`}
        >
          <span className="kpi-title">
            {outstanding > 0.005 ? "Outstanding" : "All settled"}
          </span>
          <div className="kpi-value">{inr(Math.max(0, outstanding))}</div>
        </div>
      </div>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Payment record</h2>
            <p>Maintenance and Corp Fund, month by month.</p>
          </div>
          <div className="chips">
            <button
              type="button"
              onClick={() => flat && printFlatStatement(data, flat)}
              title="Print or save your statement as PDF"
            >
              Statement
            </button>
            <button
              className={range === 3 ? "pri" : ""}
              onClick={() => setRange(3)}
            >
              3 months
            </button>
            <button
              className={range === 6 ? "pri" : ""}
              onClick={() => setRange(6)}
            >
              6 months
            </button>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th className="text">Month</th>
                <th>Maint. due</th>
                <th>Maint. paid</th>
                <th>Corp due</th>
                <th>Corp paid</th>
                <th className="text">Paid date</th>
                <th className="text">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="text" colSpan={7}>
                    No months recorded yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.month} className={r.status}>
                  <td className="text">{label(r.month)}</td>
                  <td>{n2(r.due)}</td>
                  <td>{n2(r.paid)}</td>
                  <td>{n2(r.cdue)}</td>
                  <td>{n2(r.cpaid)}</td>
                  <td className="text">
                    {payByMonth.get(r.month)?.paid_date || "—"}
                  </td>
                  <td className="text">
                    <i className={`dot ${r.status}`} />
                    {r.status === "paid"
                      ? "Paid"
                      : r.status === "part"
                        ? "Partly paid"
                        : r.status === "excluded"
                          ? "Not applicable"
                          : "Unpaid"}
                    {r.totalPaid > 0 && payByMonth.get(r.month) && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="row-mini"
                          onClick={() => {
                            const f = data.flats.find((x) => x.flat === flat);
                            if (f)
                              printReceipt(
                                data.settings,
                                f,
                                r.month,
                                payByMonth.get(r.month)!,
                              );
                          }}
                        >
                          Receipt
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
