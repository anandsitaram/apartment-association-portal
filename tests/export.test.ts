import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { buildBook, normalizeWorkbookColors } from "../src/export.js";
import { readFlatsFromWorkbook } from "../server/dbtool.js";
import { buildSummaryBook } from "../src/export-summary.js";
import { buildSummary, corpOf, maintOf } from "../shared/lib.js";

const tpl = readFileSync(new URL("../public/template.xlsx", import.meta.url));
const flats: any[] = [
  {
    flat: "A",
    sl: 1,
    name: "Owner A",
    type: "N",
    bua: 1000,
    uds: 300,
    phone: "+91 90000 00001",
    email: "a@example.com",
    excluded: true,
  },
  { flat: "B", sl: 2, name: "Owner B", type: "N", bua: 1202.8, uds: 390 },
];
const m: any = {
  month: "2026-10",
  expenses: [{ description: "Bescom", amount: 2000 }],
  method: "sqft",
  value: 2,
  rounding: "up",
  corp_rate: 0.6,
  excluded_flats: ["A"],
};

const build = (args: any) => buildBook(ExcelJS as any, tpl, args);

describe("Excel color normalization", () => {
  it("repairs malformed ARGB values before workbook serialization", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Color test");
    ws.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFFFFFF" },
    } as any;
    ws.getCell("A1").font = { color: { argb: "1F4E78" } };

    normalizeWorkbookColors(wb as any);

    expect(ws.getCell("A1").fill).toMatchObject({
      fgColor: { argb: "FFFFFFFF" },
    });
    expect(ws.getCell("A1").font).toMatchObject({
      color: { argb: "FF1F4E78" },
    });
  });
});

describe("month export", () => {
  it("exports flat identifiers and a concise combined-payment table", async () => {
    const wb = await build({
      flats,
      m,
      pays: {
        A: { maint: 100, corp: 600, mode: "UPI", paid_date: "2026-10-02" },
      },
      hide: false,
      sheet: "Oct 2026",
      corpOf,
      maintOf,
      settings: {
        hidden: ["uds", "tpaid"],
        labels: { name: "Owner", bua: "Area" },
      },
    });
    const ws: any = wb.worksheets[0];
    expect(ws.getCell("A20").value).toBe(1);
    expect(ws.getCell("B20").value).toBe("Owner A");
    expect(ws.getCell("C20").value).toBe("A");
    expect(ws.getCell("A21").value).toBe(2);
    expect(ws.getCell("C21").value).toBe("B");
    expect(ws.getCell("E19").value).toBe("Area");
    expect(ws.getCell("B19").value).toBe("Owner");
    expect(ws.getCell("H19").value).toMatch(/=0\.6 \*sqft/);
    expect(ws.getCell("C16").value).toBe("Amount per sq ft");
    expect(ws.getCell("E16").value).toBe(2);
    expect(ws.getCell("G16").value).toBe("up");
    expect(ws.getCell("H16").value).toBe("Corp Rate / Sq Ft");
    expect(ws.getCell("I16").value).toBe(0.6);
    expect(ws.getCell("I16").numFmt).toBe("0.##");
    expect(ws.getCell("F20").value).toBeNull(); // UDS values are not included in this export
    expect(ws.getCell("G20").value).toBe(0); // maintenance excluded
    expect(ws.getCell("H20").value).toBe(600);
    expect(ws.getCell("I20").value).toBe("UPI");
    expect(ws.getCell("J20").value).toBe("2026-10-02");
    expect(ws.getCell("K19").value).toBe("Expected Total (Maint + Corp Fund)");
    expect(ws.getCell("L19").value).toBe(
      "Actual Total Paid (Maint + Corp Fund)",
    );
    expect(ws.getCell("K20").value).toBe(600);
    expect(ws.getCell("L20").value).toBe(700);
    expect(ws.getCell("K21").value).toBe(2406 + 722);
    expect(ws.getColumn(6).hidden).toBe(true); // UDS
    expect(ws.getColumn(12).hidden).toBe(true); // combined paid total
    expect(ws.getCell("C48").value).toBe(null); // stale GYM placeholder cleared
    expect(ws.getCell("C49").value).toBe(null); // stale Parking placeholder cleared
    const headerText = Array.from({ length: ws.columnCount }, (_, i) =>
      String(ws.getCell(19, i + 1).value || ""),
    ).join(" | ");
    expect(headerText).not.toContain("Actual Maint Amount");
    expect(headerText).not.toContain("Actual Corp Amount");
    expect(headerText).not.toContain("Difference");
    expect(headerText).not.toContain("E-mail");
    expect(headerText).not.toContain("Selection");
    expect(ws.getCell("B17").value).toBe(null);
    expect(ws.getCell("C17").value).toBe(null);
  });
  it("exports fixed-per-flat Corp Fund amounts and respects a disabled Corp Fund", async () => {
    const fixed = await build({
      flats,
      m: {
        ...m,
        corp_applicable: true,
        corp_method: "common",
        corp_value: 250,
        corp_rounding: "none",
      },
      pays: {},
      hide: false,
      sheet: "Oct 2026",
      corpOf,
      maintOf,
      settings: { hidden: [], labels: {} },
    });
    expect((fixed.worksheets[0] as any).getCell("H21").value).toBe(250);
    const disabled = await build({
      flats,
      m: {
        ...m,
        corp_applicable: false,
        corp_method: "common",
        corp_value: 250,
      },
      pays: {},
      hide: false,
      sheet: "Oct 2026",
      corpOf,
      maintOf,
      settings: { hidden: [], labels: {} },
    });
    expect((disabled.worksheets[0] as any).getCell("H21").value).toBe(0);
  });

  it("respects Corp Fund exclusions and combined-column labels/visibility", async () => {
    const wb = await build({
      flats,
      m: { ...m, excluded_corp_flats: ["B"] },
      pays: {},
      hide: false,
      sheet: "Oct 2026",
      corpOf,
      maintOf,
      settings: { hidden: ["tpaid"], labels: { texp: "Should pay" } },
    });
    const ws: any = wb.worksheets[0];
    expect(ws.getCell("H21").value).toBe(0);
    expect(ws.getCell("K21").value).toBe(2406); // maintenance only: Corp Fund is ₹0
    expect(ws.getCell("K19").value).toBe("Should pay");
    expect(ws.getColumn(12).hidden).toBe(true);
  });
  it("refuses more flats than the template has rows for", async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({
      ...flats[0],
      flat: "F" + i,
      sl: i,
    }));
    await expect(
      build({
        flats: many,
        m,
        pays: {},
        sheet: "x",
        corpOf,
        maintOf,
      }),
    ).rejects.toThrow(/room for 30 flats/);
  });
});

describe("summary export", () => {
  const S = buildSummary(
    <any>{
      months: [m],
      payments: [{ month: "2026-10", flat: "A", maint: 100, corp: 600 }],
      archive: [
        {
          month: "2026-09",
          data: {
            expenses: [{ description: "Bescom", amount: 900 }],
            due: { A: 40, B: 40 },
            cdue: { A: 500, B: 601 },
            paid: { A: 40, B: 0 },
            cpaid: { A: 500, B: 0 },
          },
        },
      ],
    },
    flats,
  );
  const rowsOf = (ws) => {
    const out = [];
    ws.eachRow((r) => out.push(r.values.slice(1)));
    return out;
  };
  it("mirrors the screen: names for admins only, hidden and renamed columns, deleted month marked", () => {
    const settings = {
      hidden: ["s_cb"],
      labels: { s_months: "Received", s_out: "Balance" },
    };
    const admin = buildSummaryBook(ExcelJS as any, <any>{
      summary: S,
      settings,
      admin: true,
      hide: false,
    }).getWorksheet("Payments by flat");
    const head = rowsOf(admin)[1]; // eachRow skips the blank spacer row
    expect(head).toEqual([
      "SL",
      "Name",
      "Flat No",
      "Sept 2026 † Received",
      "Oct 2026 Received",
      "Total Paid",
      "Total Due",
      "Balance",
      "Corp Due",
      "Corp Paid",
    ]);
    expect(rowsOf(admin)[2][1]).toBe("Owner A");
    const viewer = buildSummaryBook(ExcelJS as any, <any>{
      summary: S,
      settings,
      admin: false,
      hide: false,
    }).getWorksheet("Payments by flat");
    expect(rowsOf(viewer)[1]).not.toContain("Name");
    const hidden = buildSummaryBook(ExcelJS as any, <any>{
      summary: S,
      settings,
      admin: true,
      hide: true,
    }).getWorksheet("Payments by flat");
    expect(rowsOf(hidden)[2][1]).toBe("••••");
  });
  it("has the expenses and shortfall sheets", () => {
    const wb = buildSummaryBook(ExcelJS as any, <any>{
      summary: S,
      settings: {},
      admin: true,
      hide: false,
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Payments by flat",
      "Expenses by month",
      "Shortfall carried fwd",
    ]);
    expect(rowsOf(wb.getWorksheet("Expenses by month"))[1]).toEqual([
      "Sept 2026 †",
      900,
      900,
    ]);
    expect(rowsOf(wb.getWorksheet("Shortfall carried fwd")).at(-2)[0]).toMatch(
      /FINAL/,
    );
  });
});

import { fileURLToPath } from "node:url";

describe("flat import", () => {
  it("reads the 28 real flat rows from the original template and ignores placeholders", async () => {
    const filePath = fileURLToPath(
      new URL("../public/template.xlsx", import.meta.url),
    );
    const rows = await readFlatsFromWorkbook(filePath);
    expect(rows).toHaveLength(28);
    expect(rows[0]).toMatchObject({
      flat: "101-3BHK",
      bua: 1706.26,
      uds: 557.49,
    });
    expect(rows.at(-1).flat).toBe("G07-3BHK");
    expect(rows.some((r) => /GYM|Parking/.test(r.flat))).toBe(false);
  });
});
