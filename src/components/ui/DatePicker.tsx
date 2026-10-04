import { useEffect, useMemo, useState } from "react";

export const dkey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fromKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m || 1) - 1, d || 1);
};

const sameDay = (a: Date, b: Date) => dkey(a) === dkey(b);

// One date format for the whole app: dd/mm/yyyy
export const fmtDate = (key: string) =>
  key
    ? fromKey(key).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("en-IN", { month: "long" }),
);

export default function DatePicker({
  value,
  onChange,
  minDate,
  allowPast = false,
  clearable = false,
  placeholder = "dd/mm/yyyy",
  label = "Select date",
  compact = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** earliest selectable day (YYYY-MM-DD). Defaults to today unless allowPast is set. */
  minDate?: string;
  /** allow days before today */
  allowPast?: boolean;
  /** show a Clear button so the date can be left empty */
  clearable?: boolean;
  placeholder?: string;
  label?: string;
  /** smaller trigger for use inside table cells */
  compact?: boolean;
  disabled?: boolean;
}) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const minimum: Date | null = minDate
    ? fromKey(minDate)
    : allowPast
      ? null
      : today;
  const selected = value ? fromKey(value) : null;
  const anchor = selected || (minimum && minimum > today ? minimum : today);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    new Date(anchor.getFullYear(), anchor.getMonth(), 1),
  );

  useEffect(() => {
    if (value) {
      const next = fromKey(value);
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - firstDay + 1),
  );
  const thisYear = today.getFullYear();
  const firstYear = Math.min(
    minimum ? minimum.getFullYear() : thisYear - 10,
    month.getFullYear(),
  );
  const years = Array.from(
    { length: Math.max(thisYear + 6, month.getFullYear()) - firstYear + 1 },
    (_, i) => firstYear + i,
  );

  const isBlocked = (day: Date) => !!minimum && day < minimum;
  const choose = (day: Date) => {
    if (isBlocked(day)) return;
    onChange(dkey(day));
    setOpen(false);
  };
  const previousDisabled =
    !!minimum &&
    new Date(month.getFullYear(), month.getMonth(), 1) <=
      new Date(minimum.getFullYear(), minimum.getMonth(), 1);
  const go = (delta: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <>
      <button
        type="button"
        className={"date-picker-trigger" + (compact ? " compact" : "")}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className={value ? "" : "placeholder"}>
          {value ? fmtDate(value) : placeholder}
        </span>
        <span aria-hidden="true">▣</span>
      </button>
      {open && (
        <div
          className="date-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="date-picker-dialog">
            <div className="date-picker-head">
              <h3>{label}</h3>
              <button
                type="button"
                className="date-picker-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="date-picker-nav">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={previousDisabled}
                aria-label="Previous month"
              >
                ‹
              </button>
              <span className="date-picker-jump">
                <select
                  aria-label="Month"
                  value={month.getMonth()}
                  onChange={(e) =>
                    setMonth(new Date(month.getFullYear(), +e.target.value, 1))
                  }
                >
                  {MONTH_NAMES.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={month.getFullYear()}
                  onChange={(e) =>
                    setMonth(new Date(+e.target.value, month.getMonth(), 1))
                  }
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="date-picker-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-picker-grid">
              {cells.map((day) => {
                const inMonth = day.getMonth() === month.getMonth();
                const disabled = isBlocked(day) || !inMonth;
                const selectedDay = !!selected && sameDay(day, selected);
                const isToday = sameDay(day, today);
                return (
                  <button
                    type="button"
                    key={dkey(day)}
                    className={`date-picker-day ${!inMonth ? "outside" : ""} ${disabled ? "disabled" : ""} ${selectedDay ? "selected" : ""} ${isToday ? "today" : ""}`}
                    disabled={disabled}
                    onClick={() => choose(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="date-picker-actions">
              {clearable && value && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              {!isBlocked(today) && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => choose(today)}
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
