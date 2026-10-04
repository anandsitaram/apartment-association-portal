import type { Settings } from "../shared/types";
import { SHEAD } from "./columns.js";
import { buildSummary, fyLabel, label, mark } from "../shared/lib.js";

type Excel = typeof import("exceljs");
type Row = import("exceljs").Row;
export interface SummaryExportArgs {
  summary: ReturnType<typeof buildSummary>;
  settings: Settings;
  admin: boolean;
  hide: boolean;
}

const safeExcelText = (value: unknown) => {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const NUMFMT = "#,##0.00";
const HEAD_STYLE = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } },
  alignment: { wrapText: true, vertical: "middle" },
};
const styleHead = (row: Row) =>
  row.eachCell((c) => Object.assign(c, HEAD_STYLE));
const styleTotal = (row: Row) =>
  row.eachCell((c) => {
    c.font = { bold: true };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDBEAFE" },
    };
  });

// Static Excel copy of the Summary tab: the same columns, names and hidden columns the screen shows.
// `summary` is buildSummary(data, flats); `admin` decides whether owner names are included.
export function buildSummaryBook(
  ExcelJS: Excel,
  { summary: S, settings, admin, hide }: SummaryExportArgs,
) {
  const wb = new ExcelJS.Workbook();
  const years = [
    ...new Set(
      S.ms.map((m) =>
        Math.floor(
          Number(m.month.slice(0, 4)) -
            (Number(m.month.slice(5, 7)) < 4 ? 1 : 0),
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  const periodLabel =
    years.length === 1
      ? fyLabel(years[0]!).toUpperCase()
      : years.length
        ? `${fyLabel(years[0]!).toUpperCase()} TO ${fyLabel(years.at(-1)!).toUpperCase()}`
        : "ALL FINANCIAL YEARS";
  const title = `MAINTENANCE PAYMENT SUMMARY – ${periodLabel}`;

  // 1. Payments by flat
  const ws = wb.addWorksheet("Payments by flat");
  const hidden = new Set(settings?.hidden || []);
  const sl = (k: string) => settings?.labels?.[k] || SHEAD[k];
  const cols = Object.keys(SHEAD).filter(
    (k) => k === "s_flat" || (!hidden.has(k) && (k !== "s_name" || admin)),
  );
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.addRow([]);
  styleHead(
    ws.addRow(
      cols.flatMap((k) =>
        k === "s_months" ? S.ms.map((v) => `${mark(v)} ${sl(k)}`) : [sl(k)],
      ),
    ),
  );
  type SRow = (typeof S.rows)[number];
  const cell = (r: SRow, k: string) =>
    ({
      s_sl: r.f.sl,
      s_name: hide ? "••••" : safeExcelText(r.f.name || ""),
      s_flat: r.f.flat,
      s_paid: r.paid,
      s_due: r.due,
      s_out: r.due - r.paid,
      s_cd: r.cd,
      s_cpd: r.cpd,
      s_cb: r.cd - r.cpd,
    })[k as "s_sl"];
  const sumOf = (fn: (r: SRow) => number) =>
    S.rows.reduce((a, r) => a + fn(r), 0);
  const totals: Record<string, string | number> = {
    s_flat: "GRAND TOTAL",
    s_paid: sumOf((r) => r.paid),
    s_due: sumOf((r) => r.due),
    s_out: sumOf((r) => r.due - r.paid),
    s_cd: sumOf((r) => r.cd),
    s_cpd: sumOf((r) => r.cpd),
    s_cb: sumOf((r) => r.cd - r.cpd),
  };
  for (const r of S.rows)
    ws.addRow(cols.flatMap((k) => (k === "s_months" ? r.cells : [cell(r, k)])));
  styleTotal(
    ws.addRow(
      cols.flatMap((k) =>
        k === "s_months" ? S.acc.map((a) => a.paid) : [totals[k] ?? null],
      ),
    ),
  );
  ws.columns.forEach((c) => {
    c.width = 16;
    c.numFmt = NUMFMT;
  });
  ws.getColumn(cols.indexOf("s_sl") + 1).numFmt = "0";
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // 2. Expenses month by month
  const we = wb.addWorksheet("Expenses by month");
  styleHead(we.addRow(["Month", ...S.descs, "Total"]));
  for (const v of S.ms) {
    const by = (d: string) =>
      (v.expenses || [])
        .filter((e) => e.description === d)
        .reduce((a, e) => a + (+e.amount || 0), 0);
    we.addRow([
      mark(v),
      ...S.descs.map(by),
      (v.expenses || []).reduce((a, e) => a + (+e.amount || 0), 0),
    ]);
  }
  we.columns.forEach((c, i) => {
    c.width = 16;
    if (i) c.numFmt = NUMFMT;
  });

  // 3. Shortfall carried forward
  const wc = wb.addWorksheet("Shortfall carried fwd");
  styleHead(
    wc.addRow([
      "Month",
      "Total Maint. Due",
      "Total Actual Paid",
      "Shortfall This Month",
      "Shortfall Carried Fwd",
      "Notes",
    ]),
  );
  for (const a of S.acc)
    wc.addRow([mark(a.m), a.due, a.paid, a.short, a.cf, a.note]);
  styleTotal(
    wc.addRow([
      `FINAL (after ${label(S.ms.at(-1)!.month)})`,
      null,
      null,
      null,
      S.cf,
      null,
    ]),
  );
  wc.columns.forEach((c, i) => {
    c.width = i === 5 ? 46 : 20;
    if (i && i < 5) c.numFmt = NUMFMT;
  });
  if (S.kept.length)
    wc.addRow([
      "† Month deleted – figures kept as they were when it was deleted.",
    ]);
  return wb;
}
