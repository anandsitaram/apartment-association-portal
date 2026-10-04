import { useEffect, useMemo, useRef, useState } from "react";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const MERIDIEMS = ["AM", "PM"] as const;

type Part = "hour" | "minute" | "meridiem";

const parseValue = (value: string) => {
  const [rawHour, rawMinute] = value.split(":").map(Number);
  const hour24 = Number.isFinite(rawHour) ? rawHour : 0;
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;
  return {
    hour: ((hour24 + 11) % 12) + 1,
    minute: Math.max(0, Math.min(59, minute)),
    meridiem: hour24 >= 12 ? "PM" : ("AM" as "AM" | "PM"),
  };
};

const toValue = (hour: number, minute: number, meridiem: "AM" | "PM") => {
  let hour24 = hour % 12;
  if (meridiem === "PM") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

function Wheel({
  items,
  value,
  format,
  onChange,
}: {
  items: readonly (number | string)[];
  value: number | string;
  format?: (item: number | string) => string;
  onChange: (item: number | string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rowHeight = 44;
  const selectedIndex = Math.max(
    0,
    items.findIndex((x) => String(x) === String(value)),
  );

  useEffect(() => {
    ref.current?.scrollTo({ top: selectedIndex * rowHeight, behavior: "auto" });
  }, [selectedIndex]);

  let scrollTimer = useRef<number | undefined>(undefined);
  const snap = () => {
    const el = ref.current;
    if (!el) return;
    const index = Math.max(
      0,
      Math.min(items.length - 1, Math.round(el.scrollTop / rowHeight)),
    );
    onChange(items[index]!);
    el.scrollTo({ top: index * rowHeight, behavior: "smooth" });
  };

  return (
    <div className="time-wheel-wrap">
      <div className="time-wheel-fade top" />
      <div
        className="time-wheel"
        ref={ref}
        onScroll={() => {
          window.clearTimeout(scrollTimer.current);
          scrollTimer.current = window.setTimeout(snap, 90);
        }}
      >
        <div className="time-wheel-spacer" />
        {items.map((item) => (
          <button
            type="button"
            key={String(item)}
            className={`time-wheel-item ${String(item) === String(value) ? "selected" : ""}`}
            onClick={() => {
              onChange(item);
              const index = items.indexOf(item);
              ref.current?.scrollTo({
                top: index * rowHeight,
                behavior: "smooth",
              });
            }}
          >
            {format ? format(item) : String(item)}
          </button>
        ))}
        <div className="time-wheel-spacer" />
      </div>
      <div className="time-wheel-selection" />
      <div className="time-wheel-fade bottom" />
    </div>
  );
}

export default function TimePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(parsed.meridiem);

  useEffect(() => {
    if (!open) {
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setMeridiem(parsed.meridiem);
    }
  }, [open, parsed.hour, parsed.minute, parsed.meridiem]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const display = `${String(parsed.hour).padStart(2, "0")} : ${String(parsed.minute).padStart(2, "0")} ${parsed.meridiem}`;

  const save = () => {
    onChange(toValue(hour, minute, meridiem));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="time-picker-trigger"
        aria-label={label || "Select time"}
        onClick={() => setOpen(true)}
      >
        <span>{display}</span>
        <span className="time-picker-chevron">⌄</span>
      </button>
      {open && (
        <div
          className="time-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={label || "Select time"}
        >
          <div className="time-picker-dialog">
            <h3>Select time</h3>
            <div className="time-picker-wheels">
              <Wheel
                items={HOURS}
                value={hour}
                format={(x) => String(x).padStart(2, "0")}
                onChange={(x) => setHour(Number(x))}
              />
              <div className="time-picker-colon">:</div>
              <Wheel
                items={MINUTES}
                value={minute}
                format={(x) => String(x).padStart(2, "0")}
                onChange={(x) => setMinute(Number(x))}
              />
              <Wheel
                items={MERIDIEMS}
                value={meridiem}
                onChange={(x) => setMeridiem(x as "AM" | "PM")}
              />
            </div>
            <div className="time-picker-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
