// Pure helpers: formatting and maintenance / Corp Fund calculations (no React, no network).
import { inr, n2 } from "./format.js";
import { APP_BRAND_NAME, APP_BRAND_SHORT } from "./branding.js";
import type {
  Archived,
  Billing,
  Data,
  Expense,
  Flat,
  Frozen,
  LedgerEntry,
  Method,
  Month,
  Payment,
  PerFlat,
  Rounding,
  Settings,
  Snap,
  SplitMode,
} from "./types.js";

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

// Number formatting lives in format.ts (no Intl, so Hermes and browsers print identically).
export { n2, inr };
export const rate = (m?: MonthCalc | null) => +(m?.corp_rate ?? 0.5); // Legacy Corp Fund rate per sq ft
export const corpMethodOf = (m?: MonthCalc | null) => m?.corp_method || "sqft";
export const corpValueOf = (m?: MonthCalc | null) =>
  +(m?.corp_value ?? m?.corp_rate ?? 0.5);
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
// Corp Fund supports either a per-sq-ft rate or a fixed amount per flat.
// Keep the current month's charge separate from carry-forward amounts so a merged
// rounding adjustment never changes the internally accounted Corp Fund charge.
export const corpChargeOf = (f: FlatCalc, m: MonthCalc | null | undefined) => {
  if (m?.corp_applicable === false || isCorpExcluded(m, f)) return 0;
  const type = String((f as any)?.type || "")
    .trim()
    .toUpperCase();
  const typeSpecific =
    type.includes("2") && type.includes("BHK")
      ? m?.corp_2bhk
      : type.includes("3") && type.includes("BHK")
        ? m?.corp_3bhk
        : null;
  const raw =
    typeSpecific != null
      ? Number(typeSpecific) || 0
      : corpMethodOf(m) === "common"
        ? corpValueOf(m)
        : rate(m) * f.bua;
  return rnd(raw, m?.corp_rounding || "nearest");
};
export const corpOf = (f: FlatCalc, m: MonthCalc | null | undefined) => {
  // In merged mode Corp Fund is included in the combined Maintenance charge and
  // must not appear as a separate due, payment, export, or UI amount.
  if (m?.notes?.mergeMaintenanceCorp === true) return 0;
  const carry = m?.notes?.carryForward?.[f.flat ?? ""];
  return corpChargeOf(f, m) + (Number(carry?.corp) || 0);
};
export const total = (m?: { expenses?: Expense[] | null } | null) =>
  (m?.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
export const billingExpenseTotal = (
  m?: {
    expenses?: Expense[] | null;
    calculated_expense_total?: number | null;
  } | null,
) =>
  m?.calculated_expense_total == null
    ? total(m)
    : Number(m.calculated_expense_total) || 0;
export const val = (m: MonthCalc) => +(m.value ?? m.divisor ?? 25);
export const rnd = (x: number, r?: Rounding | string) =>
  r === "up50"
    ? Math.ceil((x - 1e-9) / 50) * 50
    : r === "up100"
      ? Math.ceil((x - 1e-9) / 100) * 100
      : r === "up"
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
// Maintenance per flat. In merged mode the selected maintenance rounding applies
// to the combined current-month Maintenance + Corp Fund charge. The adjustment is
// placed in the maintenance bucket; the Corp Fund amount itself stays unchanged.
export const maintOf = (
  m: MonthCalc,
  f: FlatCalc,
  allFlats?: readonly FlatCalc[],
  isBlocks = false,
) => {
  const carry = m.notes?.carryForward?.[f.flat ?? ""];
  const excluded = isMaintExcluded(m, f) || isExpenseExcluded(m, f);
  let raw =
    m.method === "common"
      ? val(m)
      : m.method === "sqft"
        ? val(m) * f.bua
        : billingExpenseTotal(m) / (val(m) || 25);
  // Hybrid allocation applies to expense-based billing only. Association-wide
  // expenses retain the configured divisor; block expenses are divided only
  // among flats assigned to that block. Without block-specific expense lines,
  // legacy calculations remain unchanged.
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
    // Preserve the saved billing total used by legacy expense-based months.
    // When block expenses exist, their amounts are carved out before dividing
    // the association-wide remainder among all flats.
    const sharedTotal = Math.max(0, billingExpenseTotal(m) - blockExpenseTotal);
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
  let current = 0;
  if (m.notes?.mergeMaintenanceCorp === true) {
    // The entire rounded amount is stored and displayed as Maintenance.
    // If maintenance itself is excluded, retain only the applicable Corp Fund.
    const maintenanceCurrent = excluded ? 0 : raw;
    current = rnd(maintenanceCurrent + corpChargeOf(f, m), m.rounding);
  } else if (!excluded) {
    current = rnd(raw, m.rounding);
  }
  const carryMaintenance = Number(carry?.maintenance) || 0;
  const carryCorp = Number(carry?.corp) || 0;
  return (
    current +
    carryMaintenance +
    (m.notes?.mergeMaintenanceCorp === true ? carryCorp : 0)
  );
};
// Plain-text description of the month's maintenance calculation (what non-admins see)
export const RD: Record<string, string> = {
  nearest: "rounded to the nearest ₹1",
  up: "rounded up to the next ₹1",
  up50: "rounded up to the next ₹50",
  up100: "rounded up to the next ₹100",
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
  corpMethod: settings?.billing?.corpMethod || last?.corp_method || "sqft",
  corpValue:
    settings?.billing?.corpValue ?? last?.corp_value ?? last?.corp_rate ?? 0.5,
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
export const expFromHeads = (
  heads?: string[] | null,
  headAmounts?: Record<string, number> | null,
): Expense[] =>
  (Array.isArray(heads) && heads.length ? heads : DEFAULT_HEADS).map(
    (description) => ({
      description,
      amount: (headAmounts && headAmounts[description]) || 0,
    }),
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
    due: per((f) => maintOf(m, f, flats, isBlocks)),
    cdue: per((f) => corpOf(f, m)),
    paid: per((f) => +(by[f.flat ?? ""]?.maint ?? 0) || 0),
    cpaid: per((f) => +(by[f.flat ?? ""]?.corp ?? 0) || 0),
  };
};

// Excel formula text for a flat's maintenance in export row `r` (must give the same numbers as maintOf).
// The divide option refers to the saved billing expense total, the per-sq-ft option to the flat's sq ft in column E.
export const maintFormula = (
  m: MonthCalc,
  r: number,
  selectionColumn: string | null = null,
  expenseSelectionColumn: string | null = null,
) => {
  const v = val(m);
  const maintenanceBase =
    m.method === "common"
      ? `${v}`
      : m.method === "sqft"
        ? `${v}*E${r}`
        : `$C$14/${v || 25}`;
  const corpBase =
    corpMethodOf(m) === "common" ? `${corpValueOf(m)}` : `${rate(m)}*E${r}`;
  const corpPart =
    m.corp_applicable === false
      ? "0"
      : m.corp_rounding === "up"
        ? `ROUNDUP(${corpBase},0)`
        : m.corp_rounding === "none"
          ? `ROUND(${corpBase},2)`
          : `ROUND(${corpBase},0)`;
  const base =
    m.notes?.mergeMaintenanceCorp === true
      ? `(${maintenanceBase}+${corpPart})`
      : maintenanceBase;
  const formula =
    m.rounding === "up50"
      ? `ROUNDUP((${base})/50,0)*50`
      : m.rounding === "up100"
        ? `ROUNDUP((${base})/100,0)*100`
        : m.rounding === "up"
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
  m: MonthCalc,
  r: number,
  cr: Num,
  selectionColumn: string | null = null,
) => {
  // Corp Fund is folded into the Maintenance charge in merged mode.
  if (m?.notes?.mergeMaintenanceCorp === true || m?.corp_applicable === false)
    return "0";
  // Match corpOf exactly: disabled Corp Fund is always zero; fixed-per-flat
  // uses the saved amount rather than the square-foot rate.
  const base =
    corpMethodOf(m) === "common" ? `${corpValueOf(m)}` : `${cr}*E${r}`;
  const formula =
    m?.corp_rounding === "up"
      ? `ROUNDUP(${base},0)`
      : m?.corp_rounding === "none"
        ? `ROUND(${base},2)`
        : `ROUND(${base},0)`;
  return selectionColumn
    ? `IF(${selectionColumn}${r}="Excluded",0,${formula})`
    : formula;
};

/**
 * Build the Corpus Fund ledger's historical running balance. Flat collections
 * are recorded as month-end inflows because individual payment dates are not
 * stored per Corpus Fund bucket. Ledger entries use their actual timestamps.
 * The current fund balance still equals all flat collections + deposits - withdrawals.
 */
export const corpusLedgerRows = (
  monthlyCollections: readonly { month: string; amount: number }[],
  ledger: readonly LedgerEntry[],
): (LedgerEntry & { running: number })[] => {
  const events: {
    at: number;
    order: number;
    delta: number;
    entry?: LedgerEntry;
  }[] = [];
  for (const collection of monthlyCollections) {
    const [year, month] = collection.month.split("-").map(Number);
    const at = Date.UTC(year, month, 0, 23, 59, 59, 999);
    events.push({ at, order: 0, delta: Number(collection.amount) || 0 });
  }
  for (const entry of ledger) {
    const parsed = new Date(entry.at).getTime();
    events.push({
      at: Number.isFinite(parsed) ? parsed : 0,
      order: 1,
      delta:
        entry.kind === "deposit"
          ? Number(entry.amount) || 0
          : -(Number(entry.amount) || 0),
      entry,
    });
  }
  events.sort(
    (a, b) =>
      a.at - b.at ||
      a.order - b.order ||
      (a.entry?.id ?? 0) - (b.entry?.id ?? 0),
  );
  let running = 0;
  const runningById = new Map<number, number>();
  for (const event of events) {
    running = Math.round((running + event.delta) * 100) / 100;
    if (event.entry) runningById.set(event.entry.id, running);
  }
  return [...ledger]
    .sort(
      (a, b) =>
        new Date(b.at).getTime() - new Date(a.at).getTime() || b.id - a.id,
    )
    .map((entry) => ({ ...entry, running: runningById.get(entry.id) ?? 0 }));
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
      : expFromHeads(settings?.expenseHeads, settings?.expenseHeadAmounts);
  const calc =
    source && o.calc === "source"
      ? {
          method: source.method || "divide",
          value: val(source),
          rounding: source.rounding || "none",
          corpRate: rate(source),
          corpMethod: source.corp_method || "sqft",
          corpApplicable: source.corp_applicable === true,
          corpValue: source.corp_value ?? source.corp_rate ?? 0.5,
          corp2Bhk: source.corp_2bhk ?? null,
          corp3Bhk: source.corp_3bhk ?? null,
          corpRounding: source.corp_rounding || "nearest",
        }
      : {
          method: "divide" as Method,
          value: Math.max(flats.length, 1),
          rounding: "none" as Rounding,
          corpRate: 0.5,
          corpMethod: "sqft" as const,
          corpApplicable: false,
          corpValue: 0.5,
          corp2Bhk: null,
          corp3Bhk: null,
          corpRounding: "nearest" as Rounding,
        };
  const fromSource = !!source && o.flats === "source";
  return {
    action: "saveMonth",
    create: true,
    month: o.month,
    expenses: lines,
    ...calc,
    corpApplicable: "corpApplicable" in calc ? calc.corpApplicable : false,
    corp_rounding: calc.corpRounding,
    corp_method: calc.corpMethod,
    corp_value: calc.corpValue,
    corp2Bhk: "corp2Bhk" in calc ? calc.corp2Bhk : null,
    corp3Bhk: "corp3Bhk" in calc ? calc.corp3Bhk : null,
    notes: {
      expensesStage: "expected",
      mergeMaintenanceCorp:
        source && o.calc === "source"
          ? source.notes?.mergeMaintenanceCorp === true
          : false,
    },
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
    archived: !!m.archived,
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
