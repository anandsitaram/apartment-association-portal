import type { Data, Flat } from "../../../shared/types";
import { inr, label, total, snapshotOf, vsum } from "../../lib.js";

// Month selector (pills) plus a one-line summary of the selected month.
export default function MonthBar({
  data,
  flats,
  month,
  onSelect,
}: {
  data: Data;
  flats: Flat[];
  month: string;
  onSelect: (month: string) => void;
}) {
  const m = data.months.find((x) => x.month === month);
  if (!m) return null;
  const pays = data.payments.filter((p) => p.month === month);
  const snap = snapshotOf(flats, m, pays);
  const due = vsum(snap.due),
    paid = vsum(snap.paid),
    cdue = vsum(snap.cdue),
    cpaid = vsum(snap.cpaid);
  const items = [
    ["Expenses", total(m), ""],
    ["Maintenance collected", paid, `of ${inr(due)}`],
    ["Maintenance balance", due - paid, ""],
    ["Corpus collected", cpaid, `of ${inr(cdue)}`],
    ["Corpus balance", cdue - cpaid, ""],
  ];
  return (
    <div className="monthbar">
      <div className="pills" role="tablist" aria-label="Select month">
        {data.months.map((x) => (
          <button
            key={x.month}
            role="tab"
            aria-selected={x.month === month}
            className={"pill" + (x.month === month ? " on" : "")}
            onClick={() => onSelect(x.month)}
          >
            {label(x.month)}
          </button>
        ))}
      </div>
      <div className="month-kpis">
        {items.map(([k, v, sub]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{inr(v)}</b>
            {sub && <em>{sub}</em>}
          </div>
        ))}
      </div>
    </div>
  );
}
