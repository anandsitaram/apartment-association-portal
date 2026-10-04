import { Buffer } from 'buffer';
import type { Flat, Month, Payment, Settings } from '../../../shared/types';
import { orgName, orgShort, isCorpExcluded, isExpenseExcluded, isMaintExcluded, val } from '../../../shared/lib';

const MOBILE_TEMPLATE_BASE64 = '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';

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
  expenseHeading?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const safeExcelText = (value: unknown) => {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};
export async function buildBook(
  ExcelJS: Excel,
  tpl: ArrayBuffer | Uint8Array,
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
      mp = maintOf(m, f),
      cd = corpOf(f, m),
      mDiff = r2((p.maint || 0) - mp),
      cDiff = r2((p.corp || 0) - cd);
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
    const expected = r2(maintOf(m, f) + corpOf(f, m));
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
    result: r2(S.g + S.h),
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

/** Uses the exact ExcelJS template and report builder used by the web Months tab. */
export async function createMonthlyWorkbook(args: MonthExportArgs): Promise<string> {
  const mod = await import('exceljs');
  const template = Buffer.from(MOBILE_TEMPLATE_BASE64, 'base64');
  const workbook = await buildBook(mod.default || mod, template, args);
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes as Uint8Array).toString('base64');
}
