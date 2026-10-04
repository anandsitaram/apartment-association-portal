import { useEffect, useRef, useState } from "react";
import type { ActionBody, Flat, Month, Settings } from "../../../shared/types";
import {
  inr,
  label,
  newMonthBody,
  total,
  type NewMonthOptions,
} from "../../../shared/lib.js";
import MonthPicker from "../../components/ui/MonthPicker.jsx";

const nextMonth = (last?: string) => {
  const d = last ? new Date(last + "-01") : new Date();
  if (last) d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
};

// "Add month": pick the month and what to bring over from an earlier one. Nothing is saved until Create.
export default function NewMonthDialog({
  months,
  flats,
  settings,
  onCreate,
  onClose,
}: {
  months: Month[];
  flats: Flat[];
  settings: Settings;
  onCreate: (body: ActionBody) => Promise<boolean>;
  onClose: () => void;
}) {
  // Do not rely on array position for the latest month. Use the actual latest
  // month value so the default month cannot accidentally collide with an
  // existing month if the list arrives in a different order.
  const last = months.reduce<Month | undefined>(
    (latest, item) => (!latest || item.month > latest.month ? item : latest),
    undefined,
  );
  const [month, setMonth] = useState(nextMonth(last?.month));
  const [from, setFrom] = useState<string>(last?.month ?? "");
  const [expenses, setExpenses] =
    useState<NewMonthOptions["expenses"]>("amounts");
  const [calc, setCalc] = useState<NewMonthOptions["calc"]>("settings");
  const [flatsFrom, setFlatsFrom] =
    useState<NewMonthOptions["flats"]>("source");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const source = months.find((m) => m.month === from);
  const problem = !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? "Pick a month"
    : months.some((m) => m.month === month)
      ? `${label(month)} already exists. Select a different month, or open the existing month from the Months list.`
      : "";
  const create = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      const ok = await onCreate(
        newMonthBody(
          {
            month,
            from: source ? source.month : null,
            expenses,
            calc,
            flats: flatsFrom,
          },
          months,
          flats,
          settings,
        ),
      );
      if (ok) onClose();
    } catch {
      // Keep the dialog usable if an unexpected client-side error escapes the
      // API/save handler. Expected API errors are reported by the save handler.
    } finally {
      setBusy(false);
    }
  };
  const radio = (
    name: string,
    value: string,
    cur: string,
    set: (v: any) => void,
    text: string,
  ) => (
    <label className="opt">
      <span>
        <input
          type="radio"
          name={name}
          checked={cur === value}
          onChange={() => set(value)}
        />{" "}
        {text}
      </span>
    </label>
  );
  const src = source ? label(source.month) : "";
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-month-title"
      >
        <h3 id="new-month-title">Add month</h3>
        <div className="opt">
          <span>Month</span>
          <MonthPicker
            autoFocus
            label="Select month to add"
            value={month}
            onChange={setMonth}
          />
        </div>
        {months.length > 0 ? (
          <>
            <label className="opt">
              <span>Copy from</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {[...months].reverse().map((m) => (
                  <option key={m.month} value={m.month}>
                    {label(m.month)}
                  </option>
                ))}
                <option value="">Nothing – start fresh</option>
              </select>
            </label>
            {source && (
              <>
                <fieldset>
                  <legend>Expenses</legend>
                  {radio(
                    "nm-exp",
                    "lines",
                    expenses,
                    setExpenses,
                    `Expense lines only – amounts start at ₹0 (${source.expenses.length} lines)`,
                  )}
                  {radio(
                    "nm-exp",
                    "amounts",
                    expenses,
                    setExpenses,
                    `Lines with ${src}'s amounts (${inr(total(source))})`,
                  )}
                  {radio(
                    "nm-exp",
                    "none",
                    expenses,
                    setExpenses,
                    "Don't copy – start from the expense heads in Settings",
                  )}
                </fieldset>
                <fieldset>
                  <legend>
                    Calculation (maintenance and Corp Fund options)
                  </legend>
                  {radio(
                    "nm-calc",
                    "settings",
                    calc,
                    setCalc,
                    "Use default calculation options",
                  )}
                  {radio("nm-calc", "source", calc, setCalc, `As in ${src}`)}
                </fieldset>
                <fieldset>
                  <legend>Flats excluded from maintenance / Corp Fund</legend>
                  {radio(
                    "nm-flats",
                    "source",
                    flatsFrom,
                    setFlatsFrom,
                    `As in ${src}`,
                  )}
                  {radio(
                    "nm-flats",
                    "flats",
                    flatsFrom,
                    setFlatsFrom,
                    "As ticked on the Flats page",
                  )}
                </fieldset>
              </>
            )}
            <p className="muted">
              Payments are never copied – every month starts with no payments
              recorded.
            </p>
          </>
        ) : (
          <p className="muted">
            First month: it starts with the expense heads. Set this month’s
            billing options in the Months tab before calculating maintenance.
          </p>
        )}
        {problem && <p className="err">{problem}</p>}
        <div className="row">
          <button onClick={onClose}>Cancel</button>
          <button className="pri" disabled={!!problem || busy} onClick={create}>
            {busy ? "Creating…" : "Create month"}
          </button>
        </div>
      </div>
    </div>
  );
}
