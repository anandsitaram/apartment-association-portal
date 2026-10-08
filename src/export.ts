import { openConfirm } from "./components/ui/appDialog.js";
// Builds a clean monthly payment workbook from the bundled template and preserves resident-facing combined totals.
import type { Flat, Month, Payment, Settings } from "../shared/types";
import type { SummaryExportArgs } from "./export-summary.js";
import {
  orgName,
  orgShort,
  corpChargeOf,
  isCorpExcluded,
  isExpenseExcluded,
  isMaintExcluded,
  val,
} from "../shared/lib.js";
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
  maintOf: (
    m: Month,
    f: Flat,
    allFlats?: readonly Flat[],
    isBlocks?: boolean,
  ) => number;
  expenseHeading?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const safeExcelText = (value: unknown) => {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};
export async function buildBook(
  ExcelJS: Excel,
  tpl: ArrayBuffer | Uint8Array | Buffer,
  {
    flats,
    m,
    pays,
    hide,
    settings,
    sheet,
    corpOf,
    maintOf,
    expenseHeading,
  }: MonthExportArgs,
) {
  if (flats.length > MAX_FLATS)
    throw new Error(
      `The Excel template has room for ${MAX_FLATS} flats (you have ${flats.length}).`,
    );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl as any);
  const ws = wb.worksheets[0];
  ws.name = sheet;
  // Unmerge template-wide headings before removing columns; re-merge to the final report width later.
  for (const range of ["B2:N2", "B4:N4", "B53:N53"]) ws.unMergeCells(range);
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
  if (expenseHeading) ws.getCell("B5").value = expenseHeading;
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
  // Place the month's saved expense note directly below the expense table.
  // Row 15 is reserved for this note; billing calculation details begin on row 16.
  ws.getCell("B15").value = "Note";
  ws.getCell("C15").value = safeExcelText(m.notes?.expenses || "");
  ws.getCell("B15").style = JSON.parse(JSON.stringify(ws.getCell("B14").style));
  ws.getCell("C15").style = JSON.parse(JSON.stringify(ws.getCell("C14").style));
  ws.getCell("C15").alignment = {
    ...ws.getCell("C15").alignment,
    wrapText: true,
    vertical: "top",
  };
  ws.getRow(15).height = m.notes?.expenses ? 30 : 20;
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
  // Keep row 17 blank; detailed expense-calculation helper values are not part of the resident-facing export.
  ws.getCell("B17").value = null;
  ws.getCell("C17").value = null;
  const customColumns = settings?.custom || [];
  const metaStart = 15 + customColumns.length;
  // Extra columns after the template's A:N and any custom columns, in this order (see `meta` below):
  // E-mail, Maintenance Selection, Expense Selection, Corp Fund Selection, then the two combined totals.
  const totalExpCol = metaStart + 4;
  const totalPaidCol = metaStart + 5;
  const totalExpLetter = ws.getColumn(totalExpCol).letter;
  const totalPaidLetter = ws.getColumn(totalPaidCol).letter;
  const S = { bua: 0, uds: 0, g: 0, h: 0, i: 0, j: 0, mDiff: 0, cDiff: 0 };
  flats.forEach((f, k) => {
    const r = 20 + k,
      p: Partial<Payment> = pays[f.flat] || {},
      mp =
        m.notes?.mergeMaintenanceCorp === true
          ? maintOf(
              {
                ...m,
                notes: { ...(m.notes || {}), mergeMaintenanceCorp: false },
              },
              f,
              flats,
              settings?.isBlocks === true,
            )
          : maintOf(m, f, flats, settings?.isBlocks === true),
      cd =
        m.notes?.mergeMaintenanceCorp === true
          ? corpChargeOf(f, m)
          : corpOf(f, m),
      mDiff = r2((p.maint || 0) - mp),
      cDiff =
        m.notes?.mergeMaintenanceCorp === true ? 0 : r2((p.corp || 0) - cd);
    ws.getCell(`A${r}`).value = k + 1;
    ws.getCell(`B${r}`).value = hide
      ? "••••"
      : safeExcelText(f.name || "") || null;
    ws.getCell(`C${r}`).value = safeExcelText(f.flat || "") || null;
    // Export expected charges as a reliable snapshot. This avoids formulas depending on
    // administrative selection columns that are intentionally omitted from the final workbook.
    ws.getCell(`G${r}`).value = mp;
    ws.getCell(`H${r}`).value = cd;
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
      formula:
        m.notes?.mergeMaintenanceCorp === true
          ? `0`
          : `ROUND(N(J${r})-H${r},2)`,
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
  ws.getCell(19, COL.sl).value = "SL No";
  ws.getCell(19, COL.flat).value = "Flat No";
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
      r2(m.notes?.mergeMaintenanceCorp === true ? S.g : S.g + S.h),
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

  // Polished, consistent presentation for the exported workbook.
  const navy = "17365D";
  const blue = "1F4E78";
  const lightBlue = "D9EAF7";
  const paleBlue = "F3F7FB";
  const paleGreen = "E2F0D9";
  const paleYellow = "FFF2CC";
  const borderColor = "C7D3E0";
  const thinBorder = {
    top: {
      style: "thin" as const,
      color: { argb: `FF${borderColor}` },
    },
    left: {
      style: "thin" as const,
      color: { argb: `FF${borderColor}` },
    },
    bottom: {
      style: "thin" as const,
      color: { argb: `FF${borderColor}` },
    },
    right: {
      style: "thin" as const,
      color: { argb: `FF${borderColor}` },
    },
  };
  for (const c of [2, 3]) {
    const cell = ws.getCell(17, c);
    cell.border = thinBorder;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF7F9FC" },
    };
    cell.alignment = {
      vertical: "middle",
      wrapText: true,
      horizontal: c === 3 ? "right" : "left",
    };
  }
  ws.getCell("B17").font = { bold: true, color: { argb: `FF${navy}` } };

  // Main report title
  const title = ws.getCell("B2");
  title.font = {
    name: "Aptos Display",
    size: 16,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${navy}` },
  };
  title.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  ws.getRow(2).height = 32;
  for (let c = 2; c <= 14; c++) {
    ws.getCell(2, c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${navy}` },
    };
  }

  // Actual expenses summary block
  for (let r = 5; r <= 14; r++) {
    for (let c = 2; c <= 3; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: c === 3 ? "right" : "left",
      };
      if (r === 5) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${blue}` },
        };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
      } else if (r === 14) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${lightBlue}` },
        };
        cell.font = { bold: true, color: { argb: `FF${navy}` } };
      } else {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${r % 2 === 0 ? "FFFFFF" : paleBlue}` },
        };
      }
    }
    ws.getRow(r).height = 21;
  }
  for (let r = 6; r <= 14; r++)
    ws.getCell(r, 3).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";

  // Note and calculation settings are styled as compact information cards.
  for (const c of [2, 3]) {
    const cell = ws.getCell(15, c);
    cell.border = thinBorder;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${paleYellow}` },
    };
    cell.alignment = {
      vertical: "top",
      wrapText: true,
      horizontal: c === 2 ? "left" : "left",
    };
  }
  ws.getCell("B15").font = { bold: true, color: { argb: `FF${navy}` } };
  for (let c = 2; c <= 9; c++) {
    const cell = ws.getCell(16, c);
    cell.border = thinBorder;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${c % 2 === 0 ? lightBlue : "EEF3F8"}` },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    if ([2, 4, 6, 8].includes(c))
      cell.font = { bold: true, color: { argb: `FF${navy}` } };
  }
  ws.getRow(16).height = 32;
  ws.getCell("E16").numFmt = "₹#,##0.00";
  ws.getCell("I16").numFmt = "0.##";

  // Payment table: strong header, subtle banded rows, clear totals.
  for (let c = 1; c <= totalPaidCol; c++) {
    const header = ws.getCell(19, c);
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${navy}` },
    };
    header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    header.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    header.border = thinBorder;
    for (let r = 20; r < 50; r++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: c >= 5 && c <= totalPaidCol ? "right" : "left",
        wrapText: c === 2 || c === 11 || c === 12,
      };
      if (r < 20 + flats.length) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${(r - 20) % 2 === 0 ? "FFFFFF" : paleBlue}` },
        };
      } else {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7F9FC" },
        };
      }
    }
    const total = ws.getCell(50, c);
    total.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${paleGreen}` },
    };
    total.font = { bold: true, color: { argb: `FF${navy}` } };
    total.border = thinBorder;
    total.alignment = {
      vertical: "middle",
      horizontal: "right",
      wrapText: true,
    };
  }
  ws.getRow(19).height = 42;
  ws.getRow(50).height = 24;
  ws.getColumn(2).width = Math.max(ws.getColumn(2).width || 0, 22);
  ws.getColumn(3).width = Math.max(ws.getColumn(3).width || 0, 12);
  ws.getColumn(11).width = Math.max(ws.getColumn(11).width || 0, 14);
  ws.getColumn(12).width = Math.max(ws.getColumn(12).width || 0, 14);
  ws.getColumn(13).width = Math.max(ws.getColumn(13).width || 0, 13);
  ws.getColumn(14).width = Math.max(ws.getColumn(14).width || 0, 13);
  ws.autoFilter = {
    from: { row: 19, column: 1 },
    to: { row: 49, column: totalPaidCol },
  };
  ws.views = [{ state: "normal", showGridLines: false }];
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
  // Templates may omit the headerFooter XML node, leaving this property null after load.
  // Assign the complete object rather than mutating a possibly-null nested object.
  ws.headerFooter = {
    oddFooter: "&LGenerated maintenance report&CPage &P of &N&RConfidential",
  };

  // Deliver a concise workbook: remove the split payment/difference columns (I:J, M:N)
  // and the admin-only E-mail/selection metadata. Keep Mode, Paid Date, custom columns,
  // and the combined expected/paid totals. Delete from right to left to preserve positions.
  const corpRateStyle = JSON.parse(JSON.stringify(ws.getCell("I16").style));
  ws.spliceColumns(13, 2); // Maintenance / Corp Fund differences
  ws.spliceColumns(9, 2); // Actual Maintenance / Corp Fund paid separately
  const finalExpectedCol = 11 + customColumns.length;
  const finalPaidCol = 12 + customColumns.length;
  ws.spliceColumns(finalExpectedCol, 4); // E-mail + three selection columns

  // The Corp rate belongs in the compact calculation settings row above the payment table.
  ws.getCell("H16").value = "Corp Rate / Sq Ft";
  ws.getCell("I16").value = cr;
  ws.getCell("I16").style = corpRateStyle;
  ws.getCell("I16").numFmt = "0.##";

  // Rebuild combined totals after the column cleanup. The workbook is a point-in-time
  // export, so expected and paid figures remain correct without hidden admin columns.
  const expectedHeading =
    settings?.labels?.texp || "Expected Total (Maint + Corp Fund)";
  const paidHeading =
    settings?.labels?.tpaid || "Actual Total Paid (Maint + Corp Fund)";
  ws.getCell(19, finalExpectedCol).value = expectedHeading;
  ws.getCell(19, finalPaidCol).value = paidHeading;
  ws.getColumn(finalExpectedCol).width = 24;
  ws.getColumn(finalPaidCol).width = 24;
  for (let k = 0; k < flats.length; k++) {
    const r = 20 + k;
    const f = flats[k];
    const p: Partial<Payment> = pays[f.flat] || {};
    const expected = r2(
      m.notes?.mergeMaintenanceCorp === true
        ? maintOf(m, f, flats, settings?.isBlocks === true)
        : maintOf(m, f, flats, settings?.isBlocks === true) + corpOf(f, m),
    );
    const paid = r2((p.maint || 0) + (p.corp || 0));
    ws.getCell(r, finalExpectedCol).value = expected;
    ws.getCell(r, finalPaidCol).value = paid;
    ws.getCell(r, finalExpectedCol).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
    ws.getCell(r, finalPaidCol).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  }
  for (let r = 20 + flats.length; r < 50; r++) {
    ws.getCell(r, finalExpectedCol).value = null;
    ws.getCell(r, finalPaidCol).value = null;
  }
  ws.getCell(50, finalExpectedCol).value = {
    formula: `SUM(${ws.getColumn(finalExpectedCol).letter}20:${ws.getColumn(finalExpectedCol).letter}49)`,
    result: r2(m.notes?.mergeMaintenanceCorp === true ? S.g : S.g + S.h),
  };
  ws.getCell(50, finalPaidCol).value = {
    formula: `SUM(${ws.getColumn(finalPaidCol).letter}20:${ws.getColumn(finalPaidCol).letter}49)`,
    result: r2(S.i + S.j),
  };
  ws.getCell(50, finalExpectedCol).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  ws.getCell(50, finalPaidCol).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  ws.autoFilter = {
    from: { row: 19, column: 1 },
    to: { row: 49, column: finalPaidCol },
  };
  const finalRight = ws.getColumn(finalPaidCol).letter;
  ws.mergeCells(`B2:${finalRight}2`);
  ws.mergeCells(`B4:${finalRight}4`);
  ws.mergeCells(`B53:${finalRight}53`);

  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

// Save a Blob as a file download
export async function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: name,
  });
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Browsers may not have started consuming the Blob when click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
// file names start with the organisation's short name, e.g. "Sunrise_Sept_2026.xlsx"
const fileStem = (settings?: Pick<Settings, "orgName" | "orgShort">) =>
  orgShort(settings)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Maintenance";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function confirmPlaintextExport(kind: string): Promise<boolean> {
  return openConfirm({
    title: "Export confidential maintenance data?",
    message: `${kind} will be downloaded as a regular, unencrypted file. It may contain resident, payment, expense, or booking information. Continue only on a trusted device and store/share the file securely.`,
    confirmLabel: "Export unencrypted file",
    cancelLabel: "Cancel",
  });
}

/**
 * Excel rejects some workbooks when a theme/template style contains malformed
 * ARGB values (for example, 10-character values like FFFFFFFFFF). Normalize
 * every cell style immediately before serialization so exported files are valid
 * Office Open XML regardless of the styles inherited from the template.
 */
export function normalizeWorkbookColors(wb: { worksheets: any[] }) {
  const normalize = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(normalize);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of ["argb", "rgb"]) {
      const raw = record[key];
      if (typeof raw !== "string") continue;
      let hex = raw.replace(/^#/, "").toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) hex = `FF${hex}`;
      else if (/^[0-9A-F]{8,}$/.test(hex)) hex = hex.slice(-8);
      if (/^[0-9A-F]{8}$/.test(hex)) record[key] = hex;
      else delete record[key];
    }
    Object.values(record).forEach(normalize);
  };

  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: true }, (row: any) => {
      normalize(row.style);
      row.eachCell({ includeEmpty: true }, (cell: any) =>
        normalize(cell.style),
      );
    });
    for (const column of ws.columns || []) normalize(column.style);
  }
  return wb;
}

/**
 * Complete export is intentionally a concise summary, not the full payment tracker.
 * It contains the actual-expenses summary and note, followed by Flat Number,
 * Sq Ft, Expected Total (Maint + Corp Fund), and Actual Total Paid (Maint + Corp Fund).
 * Owner names, differences, email and selection columns are deliberately omitted.
 */
function buildCompleteSummaryBook(ExcelJS: Excel, args: MonthExportArgs) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(args.sheet);
  const navy = "17365D";
  const blue = "1F4E78";
  const lightBlue = "D9EAF7";
  const paleBlue = "F3F7FB";
  const paleGreen = "E2F0D9";
  const paleYellow = "FFF2CC";
  const borderColor = "C7D3E0";
  const border = {
    top: { style: "thin" as const, color: { argb: `FF${borderColor}` } },
    left: { style: "thin" as const, color: { argb: `FF${borderColor}` } },
    bottom: { style: "thin" as const, color: { argb: `FF${borderColor}` } },
    right: { style: "thin" as const, color: { argb: `FF${borderColor}` } },
  };
  const expenses = args.m.expenses || [];
  const title = `${orgName(args.settings).toUpperCase()} – MAINTENANCE SUMMARY – ${args.sheet.toUpperCase()}`;
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = {
    name: "Aptos Display",
    size: 16,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${navy}` },
  };
  ws.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "left",
    wrapText: true,
  };
  ws.getRow(1).height = 34;
  ws.getCell("A3").value =
    args.expenseHeading || "Actual Expenses Occurred (Summary)";
  ws.mergeCells("A3:D3");
  ws.getCell("A3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${blue}` },
  };
  ws.getCell("A3").font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  ws.getCell("A3").alignment = { vertical: "middle", wrapText: true };
  ws.getRow(3).height = 26;
  ws.getCell("A4").value = "Expense Description";
  ws.mergeCells("A4:C4");
  ws.getCell("D4").value = "Amount";
  for (const cell of [ws.getCell("A4"), ws.getCell("D4")]) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${lightBlue}` },
    };
    cell.font = { bold: true, color: { argb: `FF${navy}` } };
    cell.border = border;
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  expenses.forEach((expense, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = safeExcelText(expense.description);
    ws.mergeCells(row, 1, row, 3);
    ws.getCell(row, 4).value = Number(expense.amount) || 0;
    ws.getCell(row, 4).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
    for (const cell of [ws.getCell(row, 1), ws.getCell(row, 4)]) {
      cell.border = border;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${i % 2 === 0 ? "FFFFFF" : paleBlue}` },
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: Number(cell.col) === 4 ? "right" : "left",
      };
    }
    for (const col of [2, 3]) {
      const cell = ws.getCell(row, col);
      cell.border = border;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${i % 2 === 0 ? "FFFFFF" : paleBlue}` },
      };
    }
  });
  const totalRow = 5 + expenses.length;
  ws.getCell(totalRow, 1).value = "Total Actual Expenses";
  ws.mergeCells(totalRow, 1, totalRow, 3);
  ws.getCell(totalRow, 1).alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  const expenseTotalValue = expenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0,
  );
  ws.getCell(totalRow, 4).value = expenses.length
    ? { formula: `SUM(D5:D${totalRow - 1})`, result: expenseTotalValue }
    : 0;
  ws.getCell(totalRow, 4).numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  ws.getCell(totalRow, 4).alignment = {
    vertical: "middle",
    horizontal: "right",
  };
  for (const cell of [ws.getCell(totalRow, 1), ws.getCell(totalRow, 4)]) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${paleGreen}` },
    };
    cell.font = { bold: true, color: { argb: `FF${navy}` } };
    cell.border = border;
  }
  const noteLabelRow = totalRow + 2;
  ws.mergeCells(noteLabelRow, 1, noteLabelRow, 4);
  ws.getCell(noteLabelRow, 1).value = "Note";
  ws.getCell(noteLabelRow, 1).font = {
    bold: true,
    color: { argb: `FF${navy}` },
  };
  ws.getCell(noteLabelRow, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${paleYellow}` },
  };
  ws.getCell(noteLabelRow, 1).border = border;
  ws.getCell(noteLabelRow, 1).alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  const noteRow = noteLabelRow + 1;
  ws.mergeCells(noteRow, 1, noteRow, 4);
  ws.getCell(noteRow, 1).value = safeExcelText(args.m.notes?.expenses || "");
  ws.getCell(noteRow, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${paleYellow}` },
  };
  ws.getCell(noteRow, 1).border = border;
  ws.getCell(noteRow, 1).alignment = { vertical: "top", wrapText: true };
  ws.getRow(noteRow).height = args.m.notes?.expenses ? 36 : 22;

  const flatHeaderRow = noteRow + 3;
  const flatHeaders = [
    "Flat Number",
    "Sq Ft",
    "Expected Total (Maint + Corp Fund)",
    "Actual Total Paid (Maint + Corp Fund)",
  ];
  flatHeaders.forEach((heading, i) => {
    const cell = ws.getCell(flatHeaderRow, i + 1);
    cell.value = heading;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${navy}` },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = border;
  });
  ws.getRow(flatHeaderRow).height = 42;
  let expectedTotal = 0;
  let actualPaidTotal = 0;
  let sqftTotal = 0;
  args.flats.forEach((flat, i) => {
    const row = flatHeaderRow + 1 + i;
    const payment: Partial<Payment> = args.pays[flat.flat] || {};
    const expected =
      Math.round(
        ((Number(args.maintOf(args.m, flat)) || 0) +
          (Number(args.corpOf(flat, args.m)) || 0)) *
          100,
      ) / 100;
    const actualPaid =
      Math.round(
        ((Number(payment.maint) || 0) + (Number(payment.corp) || 0)) * 100,
      ) / 100;
    const sqft = Number(flat.bua) || 0;
    expectedTotal += expected;
    actualPaidTotal += actualPaid;
    sqftTotal += sqft;
    const values = [safeExcelText(flat.flat || ""), sqft, expected, actualPaid];
    values.forEach((value, colIndex) => {
      const cell = ws.getCell(row, colIndex + 1);
      cell.value = value;
      cell.border = border;
      const unpaid = expected > actualPaid;
      const bandColor = i % 2 === 0 ? "FFFFFF" : paleBlue;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${unpaid ? paleYellow : bandColor}` },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colIndex === 0 ? "left" : "right",
        wrapText: true,
      };
      if (colIndex >= 2) cell.numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
    });
    if (expected > actualPaid) {
      ws.getCell(row, 4).font = { bold: true, color: { argb: "FF9C0006" } };
      ws.getCell(row, 1).font = { bold: true, color: { argb: "FF9C0006" } };
    }
  });
  const flatTotalRow = flatHeaderRow + args.flats.length + 1;
  const totals = ["Total", sqftTotal, expectedTotal, actualPaidTotal];
  totals.forEach((value, i) => {
    const cell = ws.getCell(flatTotalRow, i + 1);
    cell.value = value;
    cell.border = border;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${paleGreen}` },
    };
    cell.font = { bold: true, color: { argb: `FF${navy}` } };
    cell.alignment = {
      vertical: "middle",
      horizontal: i === 0 ? "left" : "right",
    };
    if (i >= 2) cell.numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  });
  const balanceRow = flatTotalRow + 2;
  ws.mergeCells(balanceRow, 1, balanceRow, 3);
  const balanceLabel = ws.getCell(balanceRow, 1);
  balanceLabel.value =
    "Total Balance Fund (Corp Fund) = Actual Total Paid − Total expenses";
  balanceLabel.font = { bold: true, color: { argb: `FF${navy}` } };
  balanceLabel.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${paleYellow}` },
  };
  balanceLabel.border = border;
  balanceLabel.alignment = { vertical: "middle", wrapText: true };
  const balanceValue = ws.getCell(balanceRow, 4);
  const expenseTotal = expenses.reduce(
    (sum, expense) => sum + (Number(expense.amount) || 0),
    0,
  );
  balanceValue.value = {
    formula: `D${flatTotalRow}-D${totalRow}`,
    result: Math.round((actualPaidTotal - expenseTotal) * 100) / 100,
  };
  balanceValue.numFmt = "₹#,##0.00;[Red]-₹#,##0.00";
  balanceValue.font = { bold: true, color: { argb: `FF${navy}` } };
  balanceValue.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${paleYellow}` },
  };
  balanceValue.border = border;
  balanceValue.alignment = { vertical: "middle", horizontal: "right" };
  ws.getRow(balanceRow).height = 32;
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 30;
  ws.views = [{ state: "normal", showGridLines: false }];
  ws.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
  ws.headerFooter = {
    oddFooter: "&LGenerated maintenance report&CPage &P of &N&RConfidential",
  };
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

export async function exportMonth(args: MonthExportArgs) {
  if (!(await confirmPlaintextExport("This Excel report"))) return;
  const mod = await import("exceljs");
  let wb: any;
  if (args.expenseHeading) {
    // The Complete export is a dedicated concise summary and does not use the
    // full payment template (which contains owner names and payment columns).
    wb = buildCompleteSummaryBook(mod.default || mod, args);
  } else {
    // Respect Vite's configured base path (root deployments and sub-path
    // deployments behave differently when a leading slash is used).
    const base = import.meta.env.BASE_URL || "/";
    const templateUrl = `${base.endsWith("/") ? base : `${base}/`}template.xlsx`;
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(
        `Could not load Excel template (${response.status} ${response.statusText}) from ${templateUrl}`,
      );
    }
    const tpl = await response.arrayBuffer();
    wb = await buildBook(mod.default || mod, tpl, args);
  }
  normalizeWorkbookColors(wb);
  const bytes = await wb.xlsx.writeBuffer();
  const reportName = `${fileStem(args.settings)}_${args.sheet.replace(/\s+/g, "_")}${args.expenseHeading ? "_Complete" : ""}.xlsx`;
  await download(new Blob([bytes], { type: XLSX }), reportName);
}

export async function exportSummary(args: SummaryExportArgs) {
  const [mod, { buildSummaryBook }] = await Promise.all([
    import("exceljs"),
    import("./export-summary.js"),
  ]);
  const wb = buildSummaryBook(mod.default || mod, args);
  normalizeWorkbookColors(wb);
  const { ms } = args.summary;
  await download(
    new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }),
    `${fileStem(args.settings)}_Summary_${ms[0]!.month}_to_${ms.at(-1)!.month}.xlsx`,
  );
}
