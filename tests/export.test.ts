import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { buildBook } from "../src/export.js";
import { readFlatsFromWorkbook } from "../server/dbtool.js";
import { buildSummaryBook } from "../src/export-summary.js";
import { buildSummary, corpOf, maintOf } from "../src/lib.js";

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

describe("month export", () => {
  it("uses Sq Ft, the month's Corp Fund rate, renamed headers and hides columns", async () => {
    const wb = await build({
      flats,
      m,
      pays: { A: { maint: 100, corp: 600 } },
      hide: false,
      sheet: "Oct 2026",
      corpOf,
      maintOf,
      settings: { hidden: ["uds"], labels: { name: "Owner", bua: "Area" } },
    });
    const ws: any = wb.worksheets[0];
    expect(ws.getCell("E19").value).toBe("Area");
    expect(ws.getCell("B19").value).toBe("Owner");
    expect(ws.getCell("H19").value).toMatch(/=0\.6 \*sqft/);
    expect(ws.getCell("C16").value).toBe("Amount per sq ft");
    expect(ws.getCell("E16").value).toBe(2);
    expect(ws.getCell("G16").value).toBe("up");
    expect(ws.getCell("I16").value).toBe(0.6);
    // Corp Fund honours the month's Corp Fund selection (column S), like maintenance honours Q
    expect(ws.getCell("H20").value.formula).toBe(
      'IF(S20="Excluded",0,ROUND(0.6*E20,0))',
    );
    // (ExcelJS does not keep a cached result of 0; the workbook recalculates on open anyway)
    expect(ws.getCell("G20").value).toMatchObject({
      formula: 'IF(Q20="Excluded",0,ROUNDUP(2*E20,0))',
    });
    expect(ws.getColumn(6).hidden).toBe(true); // UDS
    expect(ws.getCell("B20").value).toBe("Owner A");
    expect(ws.getCell("C48").value).toBe(null); // stale GYM placeholder cleared
    expect(ws.getCell("C49").value).toBe(null); // stale Parking placeholder cleared
    expect(ws.getCell("O19").value).toBe("Phone");
    expect(ws.getCell("O20").value).toMatch(/\+91 90000 00001$/); // text starting with + is apostrophe-guarded
    expect(ws.getCell("P19").value).toBe("E-mail");
    expect(ws.getCell("P20").value).toBe("a@example.com");
    expect(ws.getCell("Q19").value).toBe("Maintenance Selection");
    expect(ws.getCell("Q20").value).toBe("Excluded");
    expect(ws.getCell("S19").value).toBe("Corp Fund Selection");
    expect(ws.getCell("S20").value).toBe("Included");
    // combined columns: expected = maintenance + Corp Fund, paid = maint paid + corp paid
    expect(ws.getCell("T19").value).toBe("Expected Total (Maint + Corp Fund)");
    expect(ws.getCell("U19").value).toBe(
      "Actual Total Paid (Maint + Corp Fund)",
    );
    expect(ws.getCell("T20").value).toEqual({
      formula: "G20+H20",
      result: 600,
    }); // A: maint 0 (excluded) + corp 600
    expect(ws.getCell("U20").value).toEqual({
      formula: "N(I20)+N(J20)",
      result: 700,
    });
    expect(ws.getCell("T21").value.result).toBe(2406 + 722); // B: 2*1202.8 rounded up + 0.6*1202.8 rounded
  });
  it("leaves out a flat that is excluded from Corp Fund and honours renamed / hidden combined columns", async () => {
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
    expect(ws.getCell("H21").value.formula).toBe(
      'IF(S21="Excluded",0,ROUND(0.6*E21,0))',
    );
    expect(ws.getCell("S21").value).toBe("Excluded");
    expect(ws.getCell("T21").value.result).toBe(2406); // maintenance only: Corp Fund is ₹0
    expect(ws.getCell("T19").value).toBe("Should pay");
    expect(ws.getColumn(21).hidden).toBe(true);
    expect(ws.getColumn(20).hidden).toBe(false);
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
  it("reads the 28 fictional demo flat rows from the sample template and ignores placeholders", async () => {
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
