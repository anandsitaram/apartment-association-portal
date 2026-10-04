// Intl-free formatting (Hermes' Intl coverage differs per platform), Indian digit grouping.
export const n2 = (
  n: number | string | null | undefined,
  digits = 2,
): string => {
  const v = Number(n) || 0;
  const [int, dec] = Math.abs(v).toFixed(digits).split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3
    : last3;
  return (v < 0 ? "-" : "") + grouped + (dec ? "." + dec : "");
};
export const inr = (n: number | string | null | undefined) => "₹" + n2(n);
export const inr0 = (n: number | string | null | undefined) =>
  "₹" + n2(Math.round(Number(n) || 0), 0);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** "2026-09" -> "Sep 2026" */
export const monthLabel = (k: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(k || "");
  return m ? `${MONTHS[+m[2] - 1] ?? m[2]} ${m[1]}` : k || "";
};
export const pad = (n: number) => String(n).padStart(2, "0");
export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isDateKey = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && todayKey(d) === v;
};
export const isTimeKey = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** Local date + time inputs -> ISO string (what the API expects), or null when invalid. */
export const toIso = (date: string, time: string): string | null => {
  if (!isDateKey(date) || !isTimeKey(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = d.getHours();
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${
    h < 12 ? "AM" : "PM"
  }`;
};
export const fmtDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
