import { useEffect, useState } from "react";

const SHORT = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("en-IN", { month: "short" }),
);
const fmt = (v: string) => {
  const [y, m] = v.split("-").map(Number);
  return new Date(y!, (m || 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
};

// Same look and feel as DatePicker, for "YYYY-MM" values
export default function MonthPicker({
  value,
  onChange,
  label = "Select month",
  placeholder = "Select month",
  clearable = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
  autoFocus?: boolean;
}) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(
    value ? Number(value.split("-")[0]) : now.getFullYear(),
  );
  useEffect(() => {
    if (value) setYear(Number(value.split("-")[0]));
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="date-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        autoFocus={autoFocus}
        onClick={() => setOpen(true)}
      >
        <span className={value ? "" : "placeholder"}>
          {value ? fmt(value) : placeholder}
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
                onClick={() => setYear(year - 1)}
                aria-label="Previous year"
              >
                ‹
              </button>
              <strong>{year}</strong>
              <button
                type="button"
                onClick={() => setYear(year + 1)}
                aria-label="Next year"
              >
                ›
              </button>
            </div>
            <div className="month-picker-grid">
              {SHORT.map((name, i) => {
                const v = `${year}-${String(i + 1).padStart(2, "0")}`;
                return (
                  <button
                    type="button"
                    key={v}
                    className={`date-picker-day ${v === value ? "selected" : ""} ${v === thisMonth && v !== value ? "today" : ""}`}
                    onClick={() => pick(v)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="date-picker-actions">
              {clearable && value && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => pick("")}
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
              <button
                type="button"
                className="btn-primary"
                onClick={() => pick(thisMonth)}
              >
                This month
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
