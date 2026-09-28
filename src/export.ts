// Fills the bundled payment template (public/template.xlsx), preserving the original A:N layout and appending complete flat master fields after custom columns.
import type { Flat, Month, Payment, Settings } from "../shared/types";
import type { SummaryExportArgs } from "./export-summary.js";
import {
  orgName,
  orgShort,
  corpFormula,
  isCorpExcluded,
  isExpenseExcluded,
  isMaintExcluded,
  maintFormula,
  val,
} from "./lib.js";
const MAX_FLATS = 30; // rows 20-49 of the template sheet
type Excel = typeof import("exceljs");

export interface MonthExportArgs {
  flats: Flat[];
  m: Month;
  pays: Record<string, Payment>;
  hide: boolean;
  settings: Settings;
  sheet: string;
  corpOf: (f: Flat, m: Month) => number;
  maintOf: (m: Month, f: Flat) => number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const safeExcelText = (value: unknown) => {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};
export async function buildBook(
  ExcelJS: Excel,
  tpl: ArrayBuffer | Uint8Array | Buffer,
  { flats, m, pays, hide, settings, sheet, corpOf, maintOf }: MonthExportArgs,
) {
  if (flats.length > MAX_FLATS)
    throw new Error(
      `The Excel template has room for ${MAX_FLATS} flats (you have ${flats.length}).`,
    );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl as any);
  const ws = wb.worksheets[0];
  ws.name = sheet;
  // Clear every template flat row first. The template contains a few legacy
  // placeholder rows (for example GYM / Parking,Motor & Lift); those must not
  // survive an export when they are not present in the database.
  for (let r = 20; r < 20 + MAX_FLATS; r++) {
    for (let c = 1; c <= 24; c++) ws.getCell(r, c).value = null;
  }
  ws.getCell("B2").value =
    orgName(settings).toUpperCase() +
    " – MAINTENANCE PAYMENT TRACKER – " +
    sheet.toUpperCase();
  const exp = (m.expenses || []).slice(0, 8);
  for (let i = 0; i < 8; i++) {
    ws.getCell(`B${6 + i}`).value = exp[i]
      ? safeExcelText(exp[i].description)
      : null;
    ws.getCell(`C${6 + i}`).value = exp[i] ? +exp[i].amount || 0 : null;
  }
  ws.getCell("C14").value = {
    formula: "SUM(C6:C13)",
    result: exp.reduce((s, e) => s + (+e.amount || 0), 0),
  };
  const cr = +(m.corp_rate ?? 0.5); // Corp Fund rate for this month
  // Keep the selected maintenance calculation visible in the exported workbook
  // as well as in the formulas below. These rows are blank in the source template.
  const methodText =
    m.method === "sqft"
      ? "Amount per sq ft"
      : m.method === "common"
        ? "Common amount"
        : "Divide total expenses";
  ws.getCell("B16").value = "Maintenance Calculation";
  ws.getCell("C16").value = methodText;
  ws.getCell("D16").value = "Value";
  ws.getCell("E16").value = val(m);
  ws.getCell("F16").value = "Rounding";
  ws.getCell("G16").value = m.rounding || "none";
  ws.getCell("H16").value = "Corp Rate / Sq Ft";
  ws.getCell("I16").value = cr;
  const customColumns = settings?.custom || [];
  const metaStart = 15 + customColumns.length;
  // Extra columns after the template's A:N and any custom columns, in this order (see `meta` below):
  // Phone, E-mail, Maintenance Selection, Expense Selection, Corp Fund Selection, then the two combined totals.
  const selectionColumn = ws.getColumn(metaStart + 2).letter;
  const expenseSelectionColumn = ws.getColumn(metaStart + 3).letter;
  const corpSelectionColumn = ws.getColumn(metaStart + 4).letter;
  const totalExpCol = metaStart + 5;
  const totalPaidCol = metaStart + 6;
  const totalExpLetter = ws.getColumn(totalExpCol).letter;
  const totalPaidLetter = ws.getColumn(totalPaidCol).letter;
  const S = { bua: 0, uds: 0, g: 0, h: 0, i: 0, j: 0, mDiff: 0, cDiff: 0 };
  flats.forEach((f, k) => {
    const r = 20 + k,
      p: Partial<Payment> = pays[f.flat] || {},
      mp = maintOf(m, f),
      cd = corpOf(f, m),
      mDiff = r2((p.maint || 0) - mp),
      cDiff = r2((p.corp || 0) - cd);
    ws.getCell(`B${r}`).value = hide
      ? "••••"
      : safeExcelText(f.name || "") || null;
    ws.getCell(`G${r}`).value = {
      formula: maintFormula(
        m,
        r,
        selectionColumn,
        Array.isArray(m.excluded_expense_flats) ? expenseSelectionColumn : null,
      ),
      result: mp,
    };
    ws.getCell(`H${r}`).value = {
      formula: corpFormula(m, r, cr, corpSelectionColumn),
      result: cd,
    };
    ws.getCell(`${totalExpLetter}${r}`).value = {
      formula: `G${r}+H${r}`,
      result: r2(mp + cd),
    };
    ws.getCell(`${totalPaidLetter}${r}`).value = {
      formula: `N(I${r})+N(J${r})`,
      result: r2((p.maint || 0) + (p.corp || 0)),
    };
    ws.getCell(`I${r}`).value = p.maint ?? null;
    ws.getCell(`J${r}`).value = p.corp ?? null;
    ws.getCell(`K${r}`).value = safeExcelText(p.mode || "") || null;
    ws.getCell(`L${r}`).value = safeExcelText(p.paid_date || "") || null;
    ws.getCell(`M${r}`).value = {
      formula: `ROUND(N(I${r})-G${r},2)`,
      result: mDiff,
    };
    ws.getCell(`N${r}`).value = {
      formula: `ROUND(N(J${r})-H${r},2)`,
      result: cDiff,
    };
    S.bua += f.bua;
    S.uds += f.uds;
    S.g += mp;
    S.h += cd;
    S.i += p.maint || 0;
    S.j += p.corp || 0;
    S.mDiff += mDiff;
    S.cDiff += cDiff;
  });
  // header row: BUA is now "Sq Ft", the Corp Fund header shows this month's rate, then any admin-set names
  const COL: Record<string, number> = {
    sl: 1,
    name: 2,
    flat: 3,
    type: 4,
    bua: 5,
    uds: 6,
    maint: 7,
    corp: 8,
    mpaid: 9,
    cpaid: 10,
    mode: 11,
    date: 12,
    mdiff: 13,
    cdiff: 14,
  };
  ws.getCell(19, COL.bua).value = "SQ FT";
  ws.getCell(19, COL.corp).value = `CORP FUND\n=${cr} *sqft\n(Round off)`;
  Object.entries(settings?.labels || {}).forEach(([k, v]) => {
    if (COL[k] && v) ws.getCell(19, COL[k]).value = v;
  });
  // column visibility (kept in sync every export, so a column unhidden on screen doesn't stay
  // hidden in Excel just because the template file itself was authored with it hidden) + custom
  // columns (appended after column N, styled like column L)
  const IDX = COL;
  Object.keys(IDX).forEach((k) => {
    if (k === "flat") return; // Flat No is never hideable
    ws.getColumn(IDX[k]).hidden = (settings?.hidden || []).includes(k);
  });
  customColumns.forEach((c, i) => {
    ws.getColumn(15 + i).width = 18;
    for (const r of [19, ...Array.from({ length: 30 }, (_, n) => 20 + n), 50]) {
      const d = ws.getCell(r, 15 + i);
      d.style = JSON.parse(JSON.stringify(ws.getCell(r, 12).style));
      d.value =
        r === 19
          ? safeExcelText(c.name)
          : r >= 20 && r < 20 + flats.length
            ? safeExcelText(
                (pays[flats[r - 20].flat]?.extra || {})[c.id] ?? "",
              ) || null
            : null;
    }
  });

  // The original payment template has no columns for the flat master data that
  // lives in Postgres (contacts and the maintenance inclusion switch). Keep the
  // original A:N layout intact and append these fields after any custom columns
  // so an export is a complete, round-trippable flat record.
  const meta: [string, (f: Flat) => string][] = [
    ["Phone", (f) => f.phone || ""],
    ["E-mail", (f) => f.email || ""],
    [
      "Maintenance Selection",
      (f) => (isMaintExcluded(m, f) ? "Excluded" : "Included"),
    ],
    [
      "Expense Selection",
      (f) => (isExpenseExcluded(m, f) ? "Excluded" : "Included"),
    ],
    [
      "Corp Fund Selection",
      (f) => (isCorpExcluded(m, f) ? "Excluded" : "Included"),
    ],
  ];
  meta.forEach(([heading, valueOf], i) => {
    const col = metaStart + i;
    ws.getColumn(col).width = i === 2 ? 24 : 22;
    const h = ws.getCell(19, col);
    h.style = JSON.parse(JSON.stringify(ws.getCell(19, 12).style));
    h.value = heading;
    for (let r = 20; r < 20 + MAX_FLATS; r++) {
      const d = ws.getCell(r, col);
      d.style = JSON.parse(JSON.stringify(ws.getCell(r, 12).style));
      d.value =
        r < 20 + flats.length
          ? safeExcelText(valueOf(flats[r - 20])) || null
          : null;
    }
    const total = ws.getCell(50, col);
    total.style = JSON.parse(JSON.stringify(ws.getCell(50, 12).style));
    total.value = null;
  });

  // combined (Maint + Corp Fund) columns: same on-screen names, visibility and admin renames as the app
  const combined: [number, string, string, string, number][] = [
    [
      totalExpCol,
      "texp",
      "Expected Total (Maint + Corp Fund)",
      totalExpLetter,
      r2(S.g + S.h),
    ],
    [
      totalPaidCol,
      "tpaid",
      "Actual Total Paid (Maint + Corp Fund)",
      totalPaidLetter,
      r2(S.i + S.j),
    ],
  ];
  combined.forEach(([col, key, heading, letter, sumResult]) => {
    ws.getColumn(col).width = 24;
    ws.getColumn(col).hidden = (settings?.hidden || []).includes(key);
    for (const r of [
      19,
      ...Array.from({ length: MAX_FLATS }, (_, n) => 20 + n),
      50,
    ]) {
      const d = ws.getCell(r, col);
      d.style = JSON.parse(JSON.stringify(ws.getCell(r, 12).style));
      if (r >= 20 && r < 50) d.numFmt = ws.getCell(r, 7).numFmt || d.numFmt;
      if (r === 19) d.value = settings?.labels?.[key] || heading;
      else if (r === 50)
        d.value = {
          formula: `SUM(${letter}20:${letter}49)`,
          result: sumResult,
        };
      else if (r >= 20 + flats.length) d.value = null;
    }
  });

  const tot = (c: string, result: number) => {
    ws.getCell(`${c}50`).value = { formula: `SUM(${c}20:${c}49)`, result };
  };
  tot("E", r2(S.bua));
  tot("F", r2(S.uds));
  tot("G", r2(S.g));
  tot("I", r2(S.i));
  tot("J", r2(S.j));
  ws.getCell("M50").value = {
    formula: 'IFERROR(SUM(M20:M49),"")',
    result: r2(S.mDiff),
  };
  ws.getCell("N50").value = {
    formula: 'IFERROR(SUM(N20:N49),"")',
    result: r2(S.cDiff),
  };
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

// Save a Blob as a file download
export function download(blob: Blob, name: string) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: name,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
// file names start with the organisation's short name, e.g. "Sunrise_Sept_2026.xlsx"
const fileStem = (settings?: Pick<Settings, "orgName" | "orgShort">) =>
  orgShort(settings)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Maintenance";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportMonth(args: MonthExportArgs) {
  const mod = await import("exceljs");
  const tpl = await (await fetch("/template.xlsx")).arrayBuffer();
  const wb = await buildBook(mod.default || mod, tpl, args);
  download(
    new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }),
    `${fileStem(args.settings)}_${args.sheet.replace(" ", "_")}.xlsx`,
  );
}

export async function exportSummary(args: SummaryExportArgs) {
  const [mod, { buildSummaryBook }] = await Promise.all([
    import("exceljs"),
    import("./export-summary.js"),
  ]);
  const wb = buildSummaryBook(mod.default || mod, args);
  const { ms } = args.summary;
  download(
    new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }),
    `${fileStem(args.settings)}_Summary_${ms[0]!.month}_to_${ms.at(-1)!.month}.xlsx`,
  );
}
