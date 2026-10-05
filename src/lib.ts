// Pure helpers: formatting and maintenance / Corp Fund calculations (no React, no network).
import { APP_BRAND_NAME, APP_BRAND_SHORT } from "../shared/branding";
import type {
  Archived,
  Billing,
  Data,
  Expense,
  Flat,
  Frozen,
  Method,
  Month,
  Payment,
  PerFlat,
  Rounding,
  Settings,
  Snap,
  SplitMode,
} from "../shared/types";

// The parts of a month / flat / settings that the calculations read (screens pass drafts and partial records)
type MonthCalc = Partial<Month> & { method?: Method; rounding?: Rounding };
type FlatCalc = {
  flat?: string;
  block?: string;
  bua: number;
  excluded?: boolean;
  corp_excluded?: boolean;
};
type OrgSettings =
  Partial<Pick<Settings, "orgName" | "orgShort">> | null | undefined;
type Num = number | string | null | undefined;

export const n2 = (n: Num) =>
  (Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const inr = (n: Num) => "₹" + n2(n);
export const rate = (m?: MonthCalc | null) => +(m?.corp_rate ?? 0.5); // Corp Fund rate (per sq ft) - set per month, default 0.5
// Corp Fund selection is month-specific, like the maintenance one: the month's list wins, the flat's own
// `corp_excluded` default is only a fallback for a month without a list.
export const isCorpExcluded = (
  m: MonthCalc | null | undefined,
  f?: Partial<FlatCalc> | null,
) => {
  const list = Array.isArray(m?.excluded_corp_flats)
    ? m.excluded_corp_flats
    : null;
  return list ? list.includes(f?.flat ?? "") : !!f?.corp_excluded;
};
// Corp Fund = rate x sq ft, rounded according to the month's saved Corp Fund setting; ₹0 for an excluded flat.
export const corpOf = (f: FlatCalc, m: MonthCalc | null | undefined) =>
  isCorpExcluded(m, f)
    ? 0
    : rnd(rate(m) * f.bua, m?.corp_rounding || "nearest");
export const total = (m?: { expenses?: Expense[] | null } | null) =>
  (m?.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
export const val = (m: MonthCalc) => +(m.value ?? m.divisor ?? 25);
export const rnd = (x: number, r?: Rounding | string) =>
  r === "up"
    ? Math.ceil(x - 1e-9)
    : r === "nearest"
      ? Math.round(x)
      : Math.round(x * 100) / 100;
// Maintenance selection is month-specific. The legacy flat-level `excluded` field is
// used only for old months that do not yet have a month selection list.
export const isExpenseExcluded = (
  m: MonthCalc | null | undefined,
  f?: Partial<FlatCalc> | null,
) => {
  const list = Array.isArray(m?.excluded_expense_flats)
    ? m.excluded_expense_flats
    : null;
  return list ? list.includes(f?.flat ?? "") : false;
};
export const isMaintExcluded = (
  m: MonthCalc | null | undefined,
  f?: Partial<FlatCalc> | null,
) => {
  const list = Array.isArray(m?.excluded_flats) ? m.excluded_flats : null;
  return list ? list.includes(f?.flat ?? "") : !!f?.excluded;
};
// Maintenance calculation, including optional hybrid block allocation. Keep this duplicate
// helper aligned with shared/lib.ts because Summary/print/export paths import from src/lib.ts.
export const maintOf = (
  m: MonthCalc,
  f: FlatCalc,
  allFlats?: readonly FlatCalc[],
  isBlocks = false,
) => {
  if (isMaintExcluded(m, f) || isExpenseExcluded(m, f)) return 0;
  let raw =
    m.method === "common"
      ? val(m)
      : m.method === "sqft"
        ? val(m) * f.bua
        : (m.calculated_expense_total == null
            ? total(m)
            : Number(m.calculated_expense_total) || 0) / (val(m) || 25);
  const blockExpenses = (m.expenses || []).filter(
    (e) => e.allocationScope === "block" && String(e.block || "").trim(),
  );
  if (
    isBlocks &&
    m.method === "divide" &&
    blockExpenses.length &&
    allFlats?.length
  ) {
    const blockExpenseTotal = blockExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0,
    );
    const billingTotal =
      m.calculated_expense_total == null
        ? total(m)
        : Number(m.calculated_expense_total) || 0;
    const sharedTotal = Math.max(0, billingTotal - blockExpenseTotal);
    const matchingBlock = String(f.block || "").trim();
    const blockTotal = matchingBlock
      ? blockExpenses.reduce(
          (sum, e) =>
            sum +
            (String(e.block || "").trim() === matchingBlock
              ? Number(e.amount) || 0
              : 0),
          0,
        )
      : 0;
    const blockCount = matchingBlock
      ? allFlats.filter(
          (flat) => String(flat.block || "").trim() === matchingBlock,
        ).length
      : 0;
    raw =
      sharedTotal / (val(m) || 25) + (blockCount ? blockTotal / blockCount : 0);
  }
  return rnd(raw, m.rounding);
};
// Plain-text description of the month's maintenance calculation (what non-admins see)
export const RD: Record<string, string> = {
  nearest: "rounded to the nearest ₹1",
  up: "rounded up to the next ₹1",
};
export const calcText = (m: MonthCalc) => {
  const v = val(m);
  const base =
    m.method === "common"
      ? `Common amount of ${inr(v)} for every owner`
      : m.method === "sqft"
        ? `${inr(v)} per sq ft × flat sq ft`
        : `Total expenses ÷ ${v || 25} flats`;
  return base + (RD[m.rounding ?? ""] ? `, ${RD[m.rounding ?? ""]}` : "");
};
export const dueDateOf = (
  month: string,
  dueDay?: number | null,
): Date | null => {
  const day = Number(dueDay) || 0;
  if (day <= 0) return null;
  const [y, mo] = month.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return new Date(y, mo - 1, Math.min(Math.max(Math.trunc(day), 1), lastDay));
};
export const isDueDatePassed = (
  month: string,
  dueDay?: number | null,
  now = new Date(),
) => {
  const due = dueDateOf(month, dueDay);
  return (
    !!due &&
    now > due &&
    (now.getFullYear() > due.getFullYear() ||
      now.getMonth() > due.getMonth() ||
      now.getDate() > due.getDate())
  );
};
export const dueDateText = (month: string, dueDay?: number | null) => {
  const due = dueDateOf(month, dueDay);
  return due
    ? due
        .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        .replace("Sept", "Sep")
    : "";
};
export const label = (k: string) =>
  new Date(k + "-01").toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
// Organisation shown in headings, the sidebar, exports and reminders (set in Settings; neutral until then)
export const orgName = (s?: OrgSettings) =>
  (s?.orgName || "").trim() || APP_BRAND_NAME;
export const orgShort = (s?: OrgSettings) =>
  (s?.orgShort || "").trim() || (s?.orgName || "").trim() || APP_BRAND_SHORT;
// Calculation defaults kept in Settings (falls back to the latest month's values, then to sensible defaults)
export const billingOf = (
  settings?: Partial<Pick<Settings, "billing">> | null,
  last?: MonthCalc | null,
): Billing => ({
  method: settings?.billing?.method || last?.method || "divide",
  value: settings?.billing
    ? +settings.billing.value || 0
    : last
      ? val(last)
      : 25,
  rounding: settings?.billing?.rounding || last?.rounding || "none",
  corpRate: settings?.billing
    ? +settings.billing.corpRate
    : last
      ? rate(last)
      : 0.5,
  corpRounding:
    settings?.billing?.corpRounding || last?.corp_rounding || "nearest",
});

// Expense lines offered for a month; the list is editable in Settings (settings.expenseHeads)
export const DEFAULT_HEADS = [
  "Bescom",
  "BWSBB",
  "Garbage",
  "Security",
  "Bescom Gym",
  "Diesel",
];
export const expFromHeads = (heads?: string[] | null): Expense[] =>
  (Array.isArray(heads) && heads.length ? heads : DEFAULT_HEADS).map(
    (description) => ({ description, amount: 0 }),
  );
export const DEFAULT_EXP = expFromHeads(DEFAULT_HEADS);

// "Actual Total Paid" typed on a month row -> maintenance paid + Corp Fund paid.
//   maint_first (default): fill maintenance up to its due, the rest goes to Corp Fund
//   corp_first:            fill Corp Fund up to its due, the rest goes to maintenance
//   proportional:          split in the ratio of the two dues (falls back to maint_first if nothing is due)
// Any surplus over the two dues lands in the second bucket. Amounts are kept to 2 decimals and always add
// back up to the total typed.
export const SPLITS: Record<SplitMode, string> = {
  maint_first: "Maintenance first, then Corp Fund",
  corp_first: "Corp Fund first, then maintenance",
  proportional: "Proportional to the amounts due",
};
export const splitOf = (
  settings?: Partial<Pick<Settings, "paymentSplit">> | null,
): SplitMode =>
  settings?.paymentSplit && Object.hasOwn(SPLITS, settings.paymentSplit)
    ? settings.paymentSplit
    : "maint_first";
const cents = (x: Num) => Math.round((Number(x) || 0) * 100) / 100;
export const allocateTotal = (
  total: Num,
  mDue: Num,
  cDue: Num,
  mode: SplitMode = "maint_first",
) => {
  const T = Math.max(cents(total), 0);
  const M = Math.max(Number(mDue) || 0, 0);
  const C = Math.max(Number(cDue) || 0, 0);
  let maint: number, corp: number;
  if (mode === "corp_first") {
    corp = Math.min(T, C);
    maint = T - corp;
  } else if (mode === "proportional" && M + C > 0) {
    maint = cents((T * M) / (M + C));
    corp = T - maint;
  } else {
    maint = Math.min(T, M);
    corp = T - maint;
  }
  return { maint: cents(maint), corp: cents(corp) };
};
export const sum = <T>(a: readonly T[], f: (x: T) => Num): number =>
  a.reduce((s: number, x) => s + (+(f(x) as number) || 0), 0);
export const vsum = (o?: PerFlat | null) =>
  sum(Object.values(o || {}), (x) => +x);
// Frozen per-flat figures of one month. Saved when a month is deleted so the Summary keeps its calculation.
export const snapshotOf = (
  flats: readonly FlatCalc[],
  m: MonthCalc & { month: string },
  pays: readonly Pick<Payment, "flat" | "maint" | "corp">[],
  isBlocks = false,
): Snap => {
  const by: Record<
    string,
    Pick<Payment, "flat" | "maint" | "corp">
  > = Object.fromEntries(pays.map((p) => [p.flat, p]));
  const per = (fn: (f: FlatCalc) => number): PerFlat =>
    Object.fromEntries(flats.map((f) => [f.flat ?? "", fn(f)]));
  return {
    month: m.month,
    expenses: (m.expenses || []).map((e) => ({
      ...e,
      description: e.description,
      amount: +e.amount || 0,
    })),
    due: per((f) => maintOf(m, f, flats)),
    cdue: per((f) => corpOf(f, m)),
    paid: per((f) => +(by[f.flat ?? ""]?.maint ?? 0) || 0),
    cpaid: per((f) => +(by[f.flat ?? ""]?.corp ?? 0) || 0),
  };
};

// Excel formula text for a flat's maintenance in export row `r` (must give the same numbers as maintOf).
// The divide option refers to the expenses total in C14, the per-sq-ft option to the flat's sq ft in column E.
export const maintFormula = (
  m: MonthCalc,
  r: number,
  selectionColumn: string | null = null,
  expenseSelectionColumn: string | null = null,
) => {
  const v = val(m);
  const base =
    m.method === "common"
      ? `${v}`
      : m.method === "sqft"
        ? `${v}*E${r}`
        : `$C$14/${v || 25}`;
  const formula =
    m.rounding === "up"
      ? `ROUNDUP(${base},0)`
      : m.rounding === "nearest"
        ? `ROUND(${base},0)`
        : `ROUND(${base},2)`;
  let out = formula;
  if (selectionColumn) out = `IF(${selectionColumn}${r}="Excluded",0,${out})`;
  if (expenseSelectionColumn)
    out = `IF(${expenseSelectionColumn}${r}="Excluded",0,${out})`;
  return out;
};

// Excel formula text for a flat's Corp Fund in export row `r` (must give the same numbers as corpOf).
export const corpFormula = (
  _m: MonthCalc,
  r: number,
  cr: Num,
  selectionColumn: string | null = null,
) => {
  const base =
    _m && (_m as any).corp_rounding === "up"
      ? `ROUNDUP(${cr}*E${r},0)`
      : _m && (_m as any).corp_rounding === "none"
        ? `ROUND(${cr}*E${r},2)`
        : `ROUND(${cr}*E${r},0)`;
  return selectionColumn
    ? `IF(${selectionColumn}${r}="Excluded",0,${base})`
    : base;
};

// ---- Add month: what to copy from an earlier month ----
export interface NewMonthOptions {
  month: string; // YYYY-MM
  from: string | null; // month to copy from, or null to start fresh
  expenses: "lines" | "amounts" | "none"; // expense lines only (amounts 0) / lines with amounts / start from Settings' heads
  calc: "settings" | "source"; // method, value, round-off and Corp Fund rate: from Settings → Billing / from the source month
  flats: "source" | "flats"; // who is included: as in the source month / as ticked on the Flats page
}

// The saveMonth request for a new month. Nothing is copied that the person did not choose; payments are never copied.
export const newMonthBody = (
  o: NewMonthOptions,
  months: readonly Month[],
  flats: readonly Flat[],
  settings: Settings,
) => {
  const source = o.from ? months.find((m) => m.month === o.from) : undefined;
  const latest = months.at(-1);
  const lines: Expense[] =
    source && o.expenses !== "none"
      ? (source.expenses || []).map((e) => ({
          ...e,
          description: e.description,
          amount: o.expenses === "amounts" ? +e.amount || 0 : 0,
        }))
      : expFromHeads(settings?.expenseHeads);
  const calc =
    source && o.calc === "source"
      ? {
          method: source.method || "divide",
          value: val(source),
          rounding: source.rounding || "none",
          corpRate: rate(source),
          corpRounding: source.corp_rounding || "nearest",
        }
      : billingOf(settings, latest);
  const fromSource = !!source && o.flats === "source";
  return {
    action: "saveMonth",
    create: true,
    month: o.month,
    expenses: lines,
    ...calc,
    corp_rounding: calc.corpRounding,
    excludedFlats: fromSource
      ? source!.excluded_flats || []
      : flats.filter((f) => f.excluded).map((f) => f.flat),
    excludedExpenseFlats: fromSource
      ? source!.excluded_expense_flats || []
      : [],
    excludedCorpFlats: fromSource
      ? source!.excluded_corp_flats || []
      : flats.filter((f) => f.corp_excluded).map((f) => f.flat),
  };
};

// Everything the Summary tab (and its Excel export) shows, from the loaded data.
// Live months are calculated from current data; deleted months come from the figures frozen when they were deleted.
// Financial year (Apr-Mar): "2026-04" belongs to FY 2026-27. Change FY_START_MONTH to 1 for calendar years.
export const FY_START_MONTH: number = 4;
export const fyOf = (month: string) => {
  const y = +month.slice(0, 4),
    mo = +month.slice(5, 7);
  return FY_START_MONTH === 1 ? y : mo >= FY_START_MONTH ? y : y - 1;
};
export const fyLabel = (fy: number) =>
  FY_START_MONTH === 1
    ? String(fy)
    : `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;

// `fy` (optional): only that financial year is shown; earlier years feed the opening balance.
export const buildSummary = (
  data: Pick<Data, "months" | "payments"> & {
    archive?: Archived[];
    settings?: Pick<Settings, "isBlocks">;
  },
  flats: readonly Flat[],
  fy: number | null = null,
) => {
  // Group payments once instead of scanning the complete payment table once per month.
  // This matters on mobile/first render when an association has years of payment history.
  const paymentsByMonth = new Map<string, Payment[]>();
  for (const p of data.payments) {
    const list = paymentsByMonth.get(p.month);
    if (list) list.push(p);
    else paymentsByMonth.set(p.month, [p]);
  }
  const live = data.months.map((m) => ({
    ...snapshotOf(
      flats,
      m,
      paymentsByMonth.get(m.month) || [],
      data.settings?.isBlocks === true,
    ),
    archived: false,
  }));
  const liveKeys = new Set(live.map((v) => v.month));
  const kept = (data.archive || [])
    .filter((a) => a.data?.due && !liveKeys.has(a.month))
    .map((a) => ({ ...a.data, month: a.month, archived: true }));
  const every = [...live, ...kept].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  const years = [...new Set(every.map((v) => fyOf(v.month)))].sort();
  const ms = fy == null ? every : every.filter((v) => fyOf(v.month) === fy);
  const at = (o: PerFlat | undefined, k: string) => +(o?.[k] ?? 0) || 0;
  // shortfall brought forward from years before the selected one
  const opening =
    fy == null
      ? 0
      : sum(
          every.filter((v) => fyOf(v.month) < fy),
          (v) => vsum(v.due) - vsum(v.paid),
        );
  let cf = opening;
  const acc = ms.map((v, i) => {
    const due = vsum(v.due),
      paid = vsum(v.paid),
      prev = cf;
    cf += due - paid;
    return {
      m: v,
      due,
      paid,
      short: due - paid,
      cf,
      note: i
        ? `Includes ${inr(prev)} carried over from ${label(ms[i - 1].month)}`
        : opening
          ? `Includes ${inr(prev)} brought forward from earlier years`
          : "First month – no prior balance",
    };
  });
  const rows = flats.map((f) => {
    const cells = ms.map((v) => at(v.paid, f.flat));
    return {
      f,
      cells,
      due: sum(ms, (v) => at(v.due, f.flat)),
      paid: sum(cells, (c) => c),
      cd: sum(ms, (v) => at(v.cdue, f.flat)),
      cpd: sum(ms, (v) => at(v.cpaid, f.flat)),
    };
  });
  const descs = [
    ...new Set(ms.flatMap((v) => (v.expenses || []).map((e) => e.description))),
  ];
  return {
    ms,
    years,
    opening,
    kept,
    acc,
    rows,
    descs,
    cf,
    dueAll: sum(acc, (a) => a.due),
    paidAll: sum(acc, (a) => a.paid),
  };
};
// month label with a dagger for a deleted month whose figures are kept
export const mark = (v: { month: string; archived?: boolean }) =>
  label(v.month) + (v.archived ? " †" : "");
