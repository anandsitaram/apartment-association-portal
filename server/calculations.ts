// Server-authoritative financial calculations used for persisted/archive data.
import type { Row } from "./types";

const num = (v: unknown): number =>
  Number.isFinite(Number(v)) ? Number(v) : 0;
const total = (m: Row | undefined) =>
  (Array.isArray(m?.expenses) ? (m.expenses as Row[]) : []).reduce(
    (s: number, e: Row) => s + num(e?.amount),
    0,
  );
const val = (m: Row | undefined) => num(m?.value ?? m?.divisor ?? 25);
const rate = (m: Row | undefined) => num(m?.corp_rate ?? 0.5);
const round = (x: number, mode?: string) =>
  mode === "up"
    ? Math.ceil(x - 1e-9)
    : mode === "nearest"
      ? Math.round(x)
      : Math.round(x * 100) / 100;
const maintOf = (m: Row | undefined, f: Row | undefined) => {
  const maintSelected = Array.isArray(m?.excluded_flats)
    ? !m.excluded_flats.includes(f?.flat)
    : !f?.excluded;
  const expenseSelected = Array.isArray(m?.excluded_expense_flats)
    ? !m.excluded_expense_flats.includes(f?.flat)
    : true;
  const selected = maintSelected && expenseSelected;
  if (!selected) return 0; // flat is deselected from this month

  const value = val(m);
  const base =
    m?.method === "common"
      ? value
      : m?.method === "sqft"
        ? value * num(f?.bua)
        : total(m) / (value || 25);
  return round(base, m?.rounding);
};
// A flat left out of this month's Corp Fund selection owes no Corp Fund. The month list wins; the flat's own
// default switch is only a fallback for a month record that has no list.
const corpSelected = (m: Row | undefined, f: Row | undefined) =>
  Array.isArray(m?.excluded_corp_flats)
    ? !m.excluded_corp_flats.includes(f?.flat)
    : !f?.corp_excluded;
const corpOf = (m: Row | undefined, f: Row | undefined) =>
  corpSelected(m, f)
    ? round(rate(m) * num(f?.bua), String(m?.corp_rounding ?? "nearest"))
    : 0;

export function snapshotOf(
  month: string,
  m: Row | undefined,
  flats: Row[] | undefined,
  payments: Row[] | undefined,
) {
  const by: Record<string, Row> = Object.fromEntries(
    (payments || []).map((p) => [p.flat, p]),
  );
  const per = (fn: (f: Row) => number) =>
    Object.fromEntries((flats || []).map((f) => [f.flat, fn(f)]));
  return {
    month,
    expenses: ((m?.expenses || []) as Row[]).map((e) => ({
      description: String(e?.description ?? "").slice(0, 60),
      amount: num(e?.amount),
    })),
    due: per((f) => maintOf(m, f)),
    cdue: per((f) => corpOf(m, f)),
    paid: per((f) => num(by[f.flat]?.maint)),
    cpaid: per((f) => num(by[f.flat]?.corp)),
  };
}
