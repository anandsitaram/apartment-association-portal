import { useEffect, useState } from "react";
import type { Expense, Month, Settings } from "../../shared/types";
import type { Save } from "../api.js";
import { calcText, expFromHeads, inr, maintOf, sum, val } from "../lib.js";

// The month's expense lines and amounts. How they turn into maintenance (method, round-off) and the Corp Fund
// rate are settings (Settings tab); each month keeps the values it was created / last updated with.
export default function Expenses({
  m,
  admin,
  onSave,
  settings,
}: {
  m: Month;
  admin: boolean;
  onSave: Save;
  settings?: Partial<Settings>;
}) {
  const heads =
    Array.isArray(settings?.expenseHeads) && settings.expenseHeads.length
      ? settings.expenseHeads
      : expFromHeads().map((e) => e.description);
  const start = () => (m.expenses?.length ? m.expenses : expFromHeads(heads));
  const [rows, setRows] = useState<Expense[]>(start);
  const [note, setNote] = useState(m.notes?.expenses || "");
  // Reset the drafts only when this month's saved lines change (not on every refetch)
  useEffect(() => {
    setRows(start());
    setNote(m.notes?.expenses || "");
  }, [m.month, JSON.stringify(m.expenses)]);
  const upd = (i: number, k: keyof Expense, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const t = sum(rows, (r) => +r.amount);
  const draft = { ...m, expenses: rows };
  return (
    <div className="card">
      <div className="section-heading-row">
        <h3>▶ Expenses</h3>
        {admin ? (
          <label className="month-note-inline">
            <span>Note</span>
            <textarea
              value={note}
              maxLength={500}
              placeholder="Add a note about this month's expenses"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        ) : note ? (
          <p className="month-note-readonly">{note}</p>
        ) : null}
      </div>
      <datalist id="expense-heads">
        {heads.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
      {rows.map((r, i) => (
        <div className="row erow" key={i}>
          <input
            disabled={!admin}
            list="expense-heads"
            value={r.description}
            onChange={(e) => upd(i, "description", e.target.value)}
          />
          <input
            disabled={!admin}
            type="number"
            step="any"
            inputMode="decimal"
            value={r.amount}
            onChange={(e) => upd(i, "amount", e.target.value)}
          />
          {admin && (
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="row">
        <b>Total expenses</b>
        <b>{inr(t)}</b>
      </div>
      <p className="calc">{calcText(draft)}</p>
      {admin && (
        <>
          <div className="row">
            <span className="muted">
              Maintenance per flat{" "}
              {draft.method === "sqft" ? "(1,202 sq ft flat)" : ""}
            </span>
            <b>{inr(maintOf(draft, { bua: 1202 }))}</b>
          </div>
          <div className="row">
            <button
              onClick={() => setRows([...rows, { description: "", amount: 0 }])}
            >
              + Add expense
            </button>
            <select
              value=""
              aria-label="Add an expense from the configured list"
              title="Expense heads are configured in Settings"
              onChange={(e) =>
                e.target.value &&
                setRows([...rows, { description: e.target.value, amount: 0 }])
              }
            >
              <option value="">Add from list…</option>
              {heads
                .filter((h) => !rows.some((r) => r.description === h))
                .map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
            </select>
            <button
              className="pri"
              onClick={() =>
                onSave({
                  action: "saveMonth",
                  month: m.month,
                  expenses: rows.map((r) => ({
                    description: r.description,
                    amount: +r.amount || 0,
                  })),
                  method: m.method || "divide",
                  value: val(m),
                  rounding: m.rounding || "none",
                  notes: { ...(m.notes || {}), expenses: note.trim() },
                })
              }
            >
              Save
            </button>
          </div>
          <span className="muted">
            Calculation method, round-off and the Corp Fund rate are set under
            Settings → Billing.
          </span>
        </>
      )}
    </div>
  );
}
