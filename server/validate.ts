import type {
  Billing,
  Expense,
  Method,
  Rounding,
  SplitMode,
} from "../shared/types";
import { fail } from "./http.js";
import type { Body } from "./types";

const num = (x: unknown, lo: number, hi: number) =>
  typeof x !== "boolean" &&
  x !== "" &&
  x != null &&
  Number.isFinite(Number(x)) &&
  Number(x) >= lo &&
  Number(x) <= hi;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const FLAT_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,19}$/;
const KEY_RE = /^[a-z0-9_]{1,24}$/i;

export const monthOf = (m: unknown): string => {
  if (!MONTH_RE.test(String(m ?? "")))
    fail(400, "Month must look like 2026-09");
  return String(m);
};
export const flatOf = (f: unknown): string => {
  const id = String(f ?? "").trim();
  if (!FLAT_RE.test(id))
    fail(400, "Flat no: 1-20 letters/numbers (space . _ - / allowed)");
  return id;
};
export const rateOf = (r: unknown): number => {
  if (!num(r, 0, 1000))
    fail(400, "Corp Fund rate must be a number between 0 and 1000");
  return Number(r);
};

// saveMonth body -> clean values (or a 400)
export function monthBody(b: Body) {
  const month = monthOf(b.month);
  if (!Array.isArray(b.expenses) || b.expenses.length > 30)
    fail(400, "Expenses must be a list of at most 30 items");
  const expenses: Expense[] = b.expenses.map((e: any) => {
    if (!e || typeof e !== "object" || !num(e.amount ?? 0, 0, 1e9))
      fail(400, "Each expense needs a description and a numeric amount");
    return {
      description: String(e.description ?? "").slice(0, 60),
      amount: +(e.amount ?? 0),
    };
  });
  const method: Method = b.method ?? "divide";
  if (!["divide", "common", "sqft"].includes(method))
    fail(400, "Unknown maintenance method");
  const rounding: Rounding = b.rounding ?? "none";
  if (!["none", "nearest", "up"].includes(rounding))
    fail(400, "Unknown round-off option");
  if (b.value != null && !num(b.value, 0, 1e9))
    fail(400, "Calculation value must be a number (0 or more)");
  const corpRate = b.corpRate == null ? null : rateOf(b.corpRate);
  const corpRounding: Rounding = b.corpRounding ?? b.corp_rounding ?? "nearest";
  if (!["none", "nearest", "up"].includes(corpRounding))
    fail(400, "Unknown Corp Fund round-off option");
  const excludedFlats =
    b.excludedFlats == null ? null : excludedFlatsOf(b.excludedFlats);
  const excludedExpenseFlats =
    b.excludedExpenseFlats == null
      ? null
      : excludedFlatsOf(b.excludedExpenseFlats);
  const excludedCorpFlats =
    b.excludedCorpFlats == null ? null : excludedFlatsOf(b.excludedCorpFlats);
  const notes =
    b.notes && typeof b.notes === "object"
      ? {
          expenses: String((b.notes as Body).expenses ?? "")
            .trim()
            .slice(0, 500),
          flats: String((b.notes as Body).flats ?? "")
            .trim()
            .slice(0, 500),
        }
      : null;
  return {
    month,
    expenses,
    method,
    rounding,
    value: b.value == null ? null : +b.value,
    corpRate,
    corpRounding,
    excludedFlats,
    excludedExpenseFlats,
    excludedCorpFlats,
    notes,
  };
}

// saveCorpusEntry body -> clean values (or a 400)
export function corpusEntryBody(b: Body) {
  if (!["deposit", "withdrawal"].includes(b.kind))
    fail(400, "Kind must be deposit or withdrawal");
  if (!num(b.amount, 0.01, 1e9)) fail(400, "Amount must be a positive number");
  const description = String(b.description || "")
    .trim()
    .slice(0, 120);
  if (!description) fail(400, "Description is required");
  const month = b.month ? monthOf(b.month) : null;
  return { kind: b.kind, amount: +b.amount, description, month };
}

export const MODES = ["", "UPI", "Bank", "Cash", "Cheque"];
// savePayment body -> clean values (or a 400)
export function paymentBody(b: Body) {
  const month = monthOf(b.month);
  const flat = flatOf(b.flat);
  if (!num(b.maint ?? 0, 0, 1e9) || !num(b.corp ?? 0, 0, 1e9))
    fail(400, "Amounts must be numbers");
  const mode = b.mode ?? "";
  if (!MODES.includes(mode)) fail(400, "Unknown payment mode");
  const date = b.date ?? "";
  if (date !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      fail(400, "Paid date must look like 2026-09-30");
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date)
      fail(400, "Paid date is not a valid calendar date");
  }
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    b.extra && typeof b.extra === "object" ? b.extra : {},
  ).slice(0, 10)) {
    if (KEY_RE.test(k)) extra[k] = String(v ?? "").slice(0, 200);
  }
  return {
    month,
    flat,
    maint: +(b.maint ?? 0),
    corp: +(b.corp ?? 0),
    mode,
    date,
    extra,
  };
}

// savePayments body (bulk) -> { month, entries[] } (or a 400). Reuses paymentBody per entry.
export function paymentsBody(b: Body) {
  const month = monthOf(b.month);
  if (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 300)
    fail(400, "Entries must be a non-empty list (max 300)");
  const entries = b.entries.map((e: Body) => paymentBody({ ...e, month }));
  return { month, entries };
}

// saveFlat body -> clean values (or a 400). phone/email are undefined when the caller did not send them (keep stored ones).
export function flatBody(b: Body) {
  const flat = flatOf(b.flat);
  const sl = Number(b.sl);
  if (!Number.isInteger(sl) || sl < 0 || sl > 9999)
    fail(400, "SL must be a whole number (0-9999)");
  if (!num(b.bua, 0.000001, 100000))
    fail(400, "Sq ft must be a number greater than 0");
  const uds = b.uds === "" || b.uds == null ? 0 : b.uds;
  if (!num(uds, 0, 100000)) fail(400, "UDS must be a number (0 or more)");
  const phone = b.phone == null ? undefined : String(b.phone).trim();
  if (phone !== undefined && phone !== "" && !/^[+0-9 ()-]{6,20}$/.test(phone))
    fail(400, "Phone: digits, spaces, + ( ) - only (6-20 characters)");
  const email = b.email == null ? undefined : String(b.email).trim();
  if (
    email !== undefined &&
    email !== "" &&
    !(email.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    fail(400, "Enter a valid e-mail address");
  return {
    flat,
    block: String(b.block ?? "")
      .trim()
      .slice(0, 30),
    sl,
    name: String(b.name ?? "")
      .trim()
      .slice(0, 60),
    type: String(b.type ?? "")
      .trim()
      .slice(0, 30),
    bua: +b.bua,
    uds: +uds,
    phone,
    email,
    excluded: !!b.excluded,
    corpExcluded: b.corpExcluded == null ? undefined : !!b.corpExcluded,
  };
}

export const excludedFlatsOf = (v: unknown): string[] => {
  const xs = Array.isArray(v)
    ? v.map((x: unknown) => String(x).trim()).filter(Boolean)
    : [];
  return [...new Set(xs)].slice(0, 300);
};

// Expense lines offered when a month is created / in the "add expense" picker. Configurable in Settings.
export const DEFAULT_EXPENSE_HEADS = [
  "Bescom",
  "BWSBB",
  "Garbage",
  "Security",
  "Bescom Gym",
  "Diesel",
];
// How an "Actual Total Paid" amount typed on a month row is split into maintenance and Corp Fund.
export const PAYMENT_SPLITS: SplitMode[] = [
  "maint_first",
  "corp_first",
  "proportional",
];

// Calculation defaults kept in Settings: the maintenance method, its value, round-off and the Corp Fund rate.
// They are copied into each new month (and applied to the latest one when saved); earlier months keep their own.
export function billingOf(x: unknown): Billing | null {
  if (!x || typeof x !== "object") return null;
  const b = x as Body;
  const method: Method = b.method ?? "divide";
  if (!["divide", "common", "sqft"].includes(method))
    fail(400, "Unknown maintenance method");
  const rounding: Rounding = b.rounding ?? "none";
  if (!["none", "nearest", "up"].includes(rounding))
    fail(400, "Unknown round-off option");
  if (b.value != null && !num(b.value, 0, 1e9))
    fail(400, "Calculation value must be a number (0 or more)");
  const corpRounding: Rounding = b.corpRounding ?? "nearest";
  if (!["none", "nearest", "up"].includes(corpRounding))
    fail(400, "Unknown Corp Fund round-off option");
  return {
    method,
    value: b.value == null ? 0 : Number(b.value),
    rounding,
    corpRate: b.corpRate == null ? 0.5 : rateOf(b.corpRate),
    corpRounding,
  };
}

export function settingsBody(s: Body = {}) {
  const cleanValues = (input: unknown, fallback: number[] = [25]): number[] =>
    [
      ...new Set(
        (Array.isArray(input) ? input : fallback)
          .map((v: unknown) => Number(v))
          .filter((v: number) => Number.isFinite(v) && v >= 0 && v <= 1e9)
          .map((v: number) => Math.round(v * 100) / 100),
      ),
    ].slice(0, 50);
  const hidden = (Array.isArray(s.hidden) ? s.hidden : [])
    .map(String)
    .filter((k: string) => KEY_RE.test(k))
    .slice(0, 40);
  const custom = (Array.isArray(s.custom) ? s.custom : [])
    .slice(0, 10)
    .map((c: Body) => ({
      id: String(c.id)
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 20),
      name: String(c.name || "")
        .trim()
        .slice(0, 40),
    }))
    .filter((c: { id: string; name: string }) => c.id && c.name);
  // display-name overrides: { columnKey: "New name" } (blank = default, so blanks are dropped)
  const labels = Object.fromEntries(
    Object.entries(s.labels && typeof s.labels === "object" ? s.labels : {})
      .filter(([k]) => KEY_RE.test(k))
      .map(([k, v]): [string, string] => [
        k,
        String(v ?? "")
          .trim()
          .slice(0, 40),
      ])
      .filter(([, v]) => v)
      .slice(0, 50),
  );
  const maintenanceValues = cleanValues(s.maintenanceValues);
  const expenseValues = cleanValues(s.expenseValues);
  // expense heads: trimmed, unique (case-insensitive), at most 30 of up to 60 characters; none sent = defaults
  const seen = new Set<string>();
  const heads: string[] = (
    Array.isArray(s.expenseHeads) ? s.expenseHeads : DEFAULT_EXPENSE_HEADS
  )
    .map((h: unknown) =>
      String(h ?? "")
        .trim()
        .slice(0, 60),
    )
    .filter(
      (h: string) =>
        h && !seen.has(h.toLowerCase()) && seen.add(h.toLowerCase()),
    )
    .slice(0, 30);
  const paymentSplit: SplitMode = PAYMENT_SPLITS.includes(s.paymentSplit)
    ? s.paymentSplit
    : "maint_first";
  return {
    hidden,
    custom,
    labels,
    maintenanceValues: maintenanceValues.length ? maintenanceValues : [25],
    expenseValues: expenseValues.length ? expenseValues : [25],
    expenseHeads: heads.length ? heads : DEFAULT_EXPENSE_HEADS,
    paymentSplit,
    dueDay: num(s.dueDay, 0, 31) ? Math.trunc(Number(s.dueDay)) : 0,
    // send overdue reminders automatically (needs a due day and notifications switched on)
    autoReminders: s.autoReminders === true,
    // organisation shown in headings, the sidebar, Excel exports and reminders
    orgName: String(s.orgName ?? "")
      .trim()
      .slice(0, 80),
    orgShort: String(s.orgShort ?? "")
      .trim()
      .slice(0, 30),
    contactEmail: String(s.contactEmail ?? "")
      .trim()
      .slice(0, 160),
    whatsappGroupName: String(s.whatsappGroupName ?? "")
      .trim()
      .slice(0, 100),
    whatsappGroupLink: String(s.whatsappGroupLink ?? "")
      .trim()
      .slice(0, 500),
    billing: billingOf(s.billing),
    // Keep the existing behaviour unless a Super Admin explicitly turns it off.
    allowAdminUserDeletion: s.allowAdminUserDeletion !== false,
    allowAdminFlatDeletion: s.allowAdminFlatDeletion !== false,
    // Default off: financial visibility across flats must be explicitly enabled.
    allowUsersViewAllFlats: s.allowUsersViewAllFlats === true,
    flatHidden: (Array.isArray(s.flatHidden) ? s.flatHidden : [])
      .map(String)
      .filter((k: string) => KEY_RE.test(k))
      .slice(0, 20),
    hallBookingAmount: num(s.hallBookingAmount, 0, 1e9)
      ? Math.round(Number(s.hallBookingAmount) * 100) / 100
      : 0,
    totalFlats:
      Number.isInteger(Number(s.totalFlats)) &&
      Number(s.totalFlats) >= 0 &&
      Number(s.totalFlats) <= 10000
        ? Math.trunc(Number(s.totalFlats))
        : 0,
  };
}

// ---- Tickets (delivery / security / maintenance requests) ----
export const TICKET_CATEGORIES = ["delivery", "security", "maintenance"];
export const TICKET_STATUSES = [
  "open",
  "approved",
  "in_progress",
  "resolved",
  "rejected",
];
export function ticketBody(b: Body) {
  if (!TICKET_CATEGORIES.includes(b.category))
    fail(400, "Category must be delivery, security or maintenance");
  const title = String(b.title ?? "")
    .trim()
    .slice(0, 120);
  if (!title) fail(400, "Title is required");
  const description = String(b.description ?? "")
    .trim()
    .slice(0, 2000);
  return { category: b.category, title, description };
}
export function ticketStatusBody(b: Body) {
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, "Invalid ticket");
  if (!TICKET_STATUSES.includes(b.status)) fail(400, "Invalid ticket status");
  const note = String(b.note ?? "")
    .trim()
    .slice(0, 500);
  return { id, status: b.status, note };
}

// ---- Party hall booking ----
export const BOOKING_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];
const MAX_BOOKING_HOURS = 24;
export function bookingBody(b: Body) {
  const title = String(b.title ?? "")
    .trim()
    .slice(0, 120);
  if (!title) fail(400, "Purpose / function name is required");
  const starts = new Date(String(b.startsAt ?? ""));
  const ends = new Date(String(b.endsAt ?? ""));
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()))
    fail(400, "Start and end date/time are required");
  if (ends.getTime() <= starts.getTime())
    fail(400, "End time must be after the start time");
  if (ends.getTime() - starts.getTime() > MAX_BOOKING_HOURS * 3600 * 1000)
    fail(400, `A single booking can span at most ${MAX_BOOKING_HOURS} hours`);
  if (starts.getTime() <= Date.now())
    fail(400, "You can't book a slot in the past");
  const note = String(b.note ?? "")
    .trim()
    .slice(0, 500);
  return {
    title,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    note,
  };
}
export function bookingStatusBody(b: Body) {
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, "Invalid booking");
  if (!BOOKING_STATUSES.includes(b.status)) fail(400, "Invalid booking status");
  const note = String(b.note ?? "")
    .trim()
    .slice(0, 500);
  return { id, status: b.status, note };
}

// ---- Canvas / polls ----
export function pollBody(b: Body) {
  const title = String(b.title ?? "")
    .trim()
    .slice(0, 150);
  if (!title) fail(400, "Poll question / title is required");
  const description = String(b.description ?? "")
    .trim()
    .slice(0, 1000);
  if (!Array.isArray(b.options)) fail(400, "Provide at least 2 options");
  const options = [
    ...new Set(
      b.options
        .map((o: unknown) =>
          String(o ?? "")
            .trim()
            .slice(0, 120),
        )
        .filter(Boolean),
    ),
  ].slice(0, 10);
  if (options.length < 2) fail(400, "Provide at least 2 different options");
  let closesAt: string | null = null;
  if (b.closesAt) {
    const d = new Date(String(b.closesAt));
    if (Number.isNaN(d.getTime())) fail(400, "Invalid closing date");
    closesAt = d.toISOString();
  }
  return { title, description, options, closesAt };
}
export function pollVoteBody(b: Body) {
  const pollId = Number(b.pollId);
  if (!Number.isInteger(pollId) || pollId <= 0) fail(400, "Invalid poll");
  const optionIndex = Number(b.optionIndex);
  if (!Number.isInteger(optionIndex) || optionIndex < 0)
    fail(400, "Invalid option");
  return { pollId, optionIndex };
}

export function eventBody(b: Body) {
  const title = String(b.title ?? "")
    .trim()
    .slice(0, 160);
  const description = String(b.description ?? "")
    .trim()
    .slice(0, 2000);
  const location = String(b.location ?? "")
    .trim()
    .slice(0, 200);
  const starts = new Date(String(b.startsAt ?? ""));
  const ends = new Date(String(b.endsAt ?? ""));
  if (!title) fail(400, "Event title is required");
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()))
    fail(400, "Start and end date/time are required");
  if (ends.getTime() <= starts.getTime())
    fail(400, "Event end time must be after the start time");
  if (starts.getTime() <= Date.now())
    fail(400, "An event must start in the future");
  if (ends.getTime() - starts.getTime() > 7 * 24 * 3600 * 1000)
    fail(400, "An event can span at most 7 days");
  return {
    title,
    description,
    location,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
  };
}
