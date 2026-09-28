import type { Month, Settings } from "../shared/types";
import { rate } from "./lib.js";

// Column keys, default names and display rules for the month tables and the Summary table.
export const HEAD: Record<string, string> = {
  sl: "SL",
  name: "Name",
  flat: "Flat No",
  type: "Apt Type",
  bua: "Sq Ft",
  uds: "UDS",
  maint: "Maintenance Amount",
  corp: "Corp Fund",
  texp: "Expected Total (Maint + Corp Fund)",
  mpaid: "Actual Maint Paid",
  cpaid: "Actual Corp Paid",
  tpaid: "Actual Total Paid (Maint + Corp Fund)",
  mode: "Mode",
  date: "Paid Date",
  mdiff: "Maint. Difference (Actual − Expected)",
  cdiff: "Corp Difference (Actual − Expected)",
};
// Summary tab: "Payments by flat" table columns (s_months = one "<Month> Paid" column per month)
export const SHEAD: Record<string, string> = {
  s_sl: "SL",
  s_name: "Name",
  s_flat: "Flat No",
  s_months: "Paid",
  s_paid: "Total Paid",
  s_due: "Total Due",
  s_out: "Outstanding",
  s_cd: "Corp Due",
  s_cpd: "Corp Paid",
  s_cb: "Corp Balance",
};
export const S_NOTE: Record<string, string> = {
  s_months: "text after the month, e.g. “Sep 2026 Paid”",
};
export const FHEAD: Record<string, string> = {
  sl: "SL",
  flat: "Flat No",
  name: "Owner name",
  type: "Apt Type",
  bua: "Sq Ft",
  uds: "UDS",
  phone: "Phone",
  email: "E-mail",
  maintExcluded: "Maint. excluded",
  corpExcluded: "Corp Fund excluded",
};
export const FNUM: string[] = ["bua", "uds"];

export const SNUM: string[] = [
  "s_paid",
  "s_due",
  "s_out",
  "s_cd",
  "s_cpd",
  "s_cb",
];
// Header text: an admin-set name wins; otherwise the default (Corp Fund shows its current rate)
export const colName = (
  k: string,
  settings: Pick<Settings, "labels">,
  m?: Partial<Month> | null,
): string =>
  settings.labels?.[k] ||
  (k === "corp"
    ? `${HEAD.corp} (${rate(m)}×sq ft, round off)`
    : (HEAD[k] ?? k));
export const HM: string[] = ["sl", "type", "bua", "uds"]; // hidden on small screens
export const TXT: string[] = ["name", "flat", "type", "mode", "date"]; // text columns: left-aligned (custom columns too)
export const TOT: string[] = ["texp", "tpaid"]; // the two combined (Maint + Corp Fund) columns; a little wider
export const NUM: string[] = [
  "bua",
  "uds",
  "maint",
  "corp",
  "texp",
  "mpaid",
  "cpaid",
  "tpaid",
  "mdiff",
  "cdiff",
];
