import { describe, expect, it } from "vitest";
import {
  allocateTotal,
  calcText,
  corpOf,
  dueDateOf,
  dueDateText,
  expFromHeads,
  isCorpExcluded,
  maintOf,
  newMonthBody,
  rate,
  snapshotOf,
  splitOf,
} from "../src/lib.js";

const flats: any[] = [
  { flat: "A", sl: 1, bua: 1000, uds: 300 },
  { flat: "B", sl: 2, bua: 1202.8, uds: 390 },
];
const month = (o: Record<string, any> = {}): any => ({
  month: "2026-09",
  expenses: [
    { description: "Bescom", amount: 1000 },
    { description: "Security", amount: 500 },
  ],
  method: "divide",
  value: 25,
  rounding: "none",
  ...o,
});

describe("Corp Fund rounding", () => {
  it("supports none, nearest and up independently from maintenance rounding", () => {
    const m = month({ corp_rate: 0.333, corp_rounding: "none" });
    expect(corpOf(flats[0], m)).toBe(333);
    expect(corpOf(flats[1], m)).toBe(400.53);
    expect(
      corpOf(flats[1], month({ corp_rate: 0.333, corp_rounding: "nearest" })),
    ).toBe(401);
    expect(
      corpOf(flats[1], month({ corp_rate: 0.333, corp_rounding: "up" })),
    ).toBe(401);
  });
});

describe("payment due date", () => {
  it("disables the due date when Settings uses day 0 and clamps oversized days", () => {
    expect(dueDateOf("2026-09", 0)).toBeNull();
    expect(dueDateText("2026-09", 5)).toBe("5 Sep");
    expect(dueDateOf("2026-02", 31)?.getDate()).toBe(28);
  });
});

describe("maintenance", () => {
  it("divide: total / N, then rounding", () => {
    expect(maintOf(month(), flats[0])).toBe(60);
    expect(maintOf(month({ value: 7 }), flats[0])).toBe(214.29);
    expect(maintOf(month({ value: 7, rounding: "up" }), flats[0])).toBe(215);
    expect(maintOf(month({ value: 7, rounding: "nearest" }), flats[0])).toBe(
      214,
    );
  });
  it("month-specific flat selection overrides the legacy flat flag", () => {
    expect(maintOf(month({ excluded_flats: ["A"] }), flats[0])).toBe(0);
    expect(maintOf(month({ excluded_flats: ["A"] }), flats[1])).toBe(60);
  });
  it("expense flat selection can exclude a flat from expense-based maintenance", () => {
    expect(maintOf(month({ excluded_expense_flats: ["A"] }), flats[0])).toBe(0);
    expect(maintOf(month({ excluded_expense_flats: ["A"] }), flats[1])).toBe(
      60,
    );
  });
  it("common amount and per-sq-ft", () => {
    expect(maintOf(month({ method: "common", value: 100 }), flats[0])).toBe(
      100,
    );
    expect(maintOf(month({ method: "sqft", value: 2 }), flats[1])).toBe(2405.6);
  });
});

describe("corp fund", () => {
  it("defaults to 0.5 x sq ft, rounded", () => {
    expect(rate(month())).toBe(0.5);
    expect(corpOf(flats[1], month())).toBe(601); // 601.4
  });
  it("uses the month's own rate", () => {
    expect(corpOf(flats[0], month({ corp_rate: 0.75 }))).toBe(750);
    expect(corpOf(flats[0], month({ corp_rate: 0 }))).toBe(0);
  });
});

describe("corp fund selection", () => {
  it("a flat left out of the month's Corp Fund selection owes ₹0, others are unaffected", () => {
    const m = month({ excluded_corp_flats: ["A"] });
    expect(corpOf(flats[0], m)).toBe(0);
    expect(corpOf(flats[1], m)).toBe(601);
    expect(maintOf(m, flats[0])).toBe(60); // maintenance is independent
  });
  it("the month list wins; the flat's own switch is only a fallback for a month without a list", () => {
    const f = { ...flats[0], corp_excluded: true };
    expect(isCorpExcluded(month(), f)).toBe(true);
    expect(corpOf(f, month())).toBe(0);
    expect(isCorpExcluded(month({ excluded_corp_flats: [] }), f)).toBe(false);
    expect(corpOf(f, month({ excluded_corp_flats: [] }))).toBe(500);
  });
  it("is frozen into a month snapshot", () => {
    const s = snapshotOf(flats, month({ excluded_corp_flats: ["B"] }), []);
    expect(s.cdue).toEqual({ A: 500, B: 0 });
  });
});

describe("Actual Total Paid split", () => {
  it("maintenance first: exact payment gives exactly the two dues (Flat 104 style: 2500 = 1900 + 600)", () => {
    expect(allocateTotal(2500, 1900, 600)).toEqual({ maint: 1900, corp: 600 });
  });
  it("maintenance first: a short payment fills maintenance, the rest goes to Corp Fund; a surplus lands in Corp Fund", () => {
    expect(allocateTotal(1500, 1900, 600)).toEqual({ maint: 1500, corp: 0 });
    expect(allocateTotal(2000, 1900, 600)).toEqual({ maint: 1900, corp: 100 });
    expect(allocateTotal(3000, 1900, 600)).toEqual({ maint: 1900, corp: 1100 });
  });
  it("corp first: Corp Fund is filled first, a surplus lands in maintenance", () => {
    expect(allocateTotal(500, 1900, 600, "corp_first")).toEqual({
      maint: 0,
      corp: 500,
    });
    expect(allocateTotal(2500, 1900, 600, "corp_first")).toEqual({
      maint: 1900,
      corp: 600,
    });
    expect(allocateTotal(3000, 1900, 600, "corp_first")).toEqual({
      maint: 2400,
      corp: 600,
    });
  });
  it("proportional: split in the ratio of the dues, always adds back to the total", () => {
    const a = allocateTotal(1000, 1900, 600, "proportional");
    expect(a).toEqual({ maint: 760, corp: 240 });
    const b = allocateTotal(1000.01, 333, 667, "proportional");
    expect(+(b.maint + b.corp).toFixed(2)).toBe(1000.01);
    expect(allocateTotal(500, 0, 0, "proportional")).toEqual({
      maint: 0,
      corp: 500,
    }); // nothing due: maint-first rule
  });
  it("copes with decimals, zero, negative and junk input", () => {
    expect(allocateTotal(0, 1900, 600)).toEqual({ maint: 0, corp: 0 });
    expect(allocateTotal(-5, 1900, 600)).toEqual({ maint: 0, corp: 0 });
    expect(allocateTotal("abc", 1900, 600)).toEqual({ maint: 0, corp: 0 });
    expect(allocateTotal(2404.5, 2404, 601)).toEqual({
      maint: 2404,
      corp: 0.5,
    });
  });
  it("an unknown setting falls back to maintenance first", () => {
    expect(splitOf({})).toBe("maint_first");
    expect(splitOf({ paymentSplit: "nonsense" as any })).toBe("maint_first");
    expect(splitOf({ paymentSplit: "corp_first" })).toBe("corp_first");
  });
});

describe("Add month: what is copied", () => {
  const prev = month({
    month: "2026-08",
    method: "sqft",
    value: 2,
    rounding: "up",
    corp_rate: 0.8,
    excluded_flats: ["A"],
    excluded_expense_flats: ["B"],
    excluded_corp_flats: ["B"],
  });
  const fl: any[] = [
    { flat: "A", excluded: false, corp_excluded: true },
    { flat: "B", excluded: true, corp_excluded: false },
  ];
  const settings: any = {
    expenseHeads: ["X", "Y"],
    billing: { method: "divide", value: 30, rounding: "none", corpRate: 0.5 },
  };
  const base = {
    month: "2026-09",
    from: "2026-08" as string | null,
    expenses: "lines" as const,
    calc: "settings" as const,
    flats: "source" as const,
  };
  it("defaults: lines with ₹0, billing from Settings, flat selection from the source month", () => {
    const b = newMonthBody(base, [prev], fl, settings);
    expect(b).toMatchObject({
      action: "saveMonth",
      create: true,
      month: "2026-09",
      method: "divide",
      value: 30,
      corpRate: 0.5,
      excludedFlats: ["A"],
      excludedExpenseFlats: ["B"],
      excludedCorpFlats: ["B"],
    });
    expect(b.expenses).toEqual([
      { description: "Bescom", amount: 0 },
      { description: "Security", amount: 0 },
    ]);
  });
  it("can copy the amounts and the calculation from the source month", () => {
    const b = newMonthBody(
      { ...base, expenses: "amounts", calc: "source" },
      [prev],
      fl,
      settings,
    );
    expect(b.expenses).toEqual([
      { description: "Bescom", amount: 1000 },
      { description: "Security", amount: 500 },
    ]);
    expect(b).toMatchObject({
      method: "sqft",
      value: 2,
      rounding: "up",
      corpRate: 0.8,
    });
  });
  it("can start from the Settings heads and the Flats page switches instead", () => {
    const b = newMonthBody(
      { ...base, expenses: "none", flats: "flats" },
      [prev],
      fl,
      settings,
    );
    expect(b.expenses).toEqual([
      { description: "X", amount: 0 },
      { description: "Y", amount: 0 },
    ]);
    expect(b).toMatchObject({
      excludedFlats: ["B"],
      excludedExpenseFlats: [],
      excludedCorpFlats: ["A"],
    });
  });
  it("starting fresh (or a first month) copies nothing", () => {
    const b = newMonthBody(
      { ...base, from: null, expenses: "amounts", calc: "source" },
      [prev],
      fl,
      settings,
    );
    expect(b.expenses.map((e) => e.amount)).toEqual([0, 0]);
    expect(b.expenses.map((e) => e.description)).toEqual(["X", "Y"]);
    expect(b).toMatchObject({
      method: "divide",
      value: 30,
      excludedFlats: ["B"],
    });
    expect(newMonthBody(base, [], fl, settings).expenses).toHaveLength(2);
  });
});

describe("expense heads", () => {
  it("default lines include Bescom Gym and Diesel; a configured list is used as given", () => {
    expect(expFromHeads().map((e) => e.description)).toEqual([
      "Bescom",
      "BWSBB",
      "Garbage",
      "Security",
      "Bescom Gym",
      "Diesel",
    ]);
    expect(expFromHeads(["A", "B"])).toEqual([
      { description: "A", amount: 0 },
      { description: "B", amount: 0 },
    ]);
  });
});

describe("text + snapshot", () => {
  it("describes the selected calculation", () => {
    expect(calcText(month())).toBe("Total expenses ÷ 25 flats");
    expect(
      calcText(month({ method: "sqft", value: 2, rounding: "up" })),
    ).toMatch(/per sq ft × flat sq ft, rounded up/);
  });
  it("snapshot freezes per-flat due/paid for a month", () => {
    const s = snapshotOf(flats, month({ corp_rate: 0.6 }), [
      { flat: "A", maint: 60, corp: 500 },
    ]);
    expect(s.due).toEqual({ A: 60, B: 60 });
    expect(s.cdue).toEqual({ A: 600, B: 722 });
    expect(s.paid).toEqual({ A: 60, B: 0 });
    expect(s.cpaid).toEqual({ A: 500, B: 0 });
  });
});

// The Excel export writes formulas; they must agree with what the app shows (maintOf)
import { maintFormula, buildSummary } from "../src/lib.js";
describe("export formulas match the app", () => {
  const R = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const RU = (x, d) => Math.ceil(x * 10 ** d - 1e-9) / 10 ** d;
  const evalFormula = (m, flat) => {
    const total = m.expenses.reduce((s, e) => s + e.amount, 0);
    const src = maintFormula(m, 20)
      .replace(/\$C\$14/g, String(total))
      .replace(/E\d+/g, String(flat.bua))
      .replace(/ROUNDUP\(/g, "RU(")
      .replace(/ROUND\(/g, "R(");
    return new Function("R", "RU", `return ${src}`)(R, RU);
  };
  const cases = [
    ["divide", 25, "none"],
    ["divide", 7, "none"],
    ["divide", 7, "up"],
    ["divide", 7, "nearest"],
    ["common", 100.5, "none"],
    ["common", 99.4, "up"],
    ["sqft", 2, "none"],
    ["sqft", 1.75, "nearest"],
    ["sqft", 1.75, "up"],
  ];
  it.each(cases)("%s value %s rounding %s", (method, value, rounding) => {
    for (const f of flats) {
      const m = month({ method, value, rounding });
      expect(evalFormula(m, f)).toBeCloseTo(maintOf(m, f), 6);
    }
  });
});

describe("summary", () => {
  it("adds live months and figures kept from deleted months", () => {
    const data = {
      months: [month({ month: "2026-10", corp_rate: 0.5 })],
      payments: [{ month: "2026-10", flat: "A", maint: 60, corp: 500 }],
      archive: [
        {
          month: "2026-09",
          data: {
            expenses: [{ description: "Bescom", amount: 900 }],
            due: { A: 36, B: 36 },
            cdue: { A: 500, B: 601 },
            paid: { A: 36, B: 0 },
            cpaid: { A: 500, B: 0 },
          },
        },
        { month: "2026-10", data: { due: { A: 1 } } }, // same key as a live month: ignored
      ],
    };
    const S = buildSummary(data as any, flats);
    expect(S.ms.map((v) => [v.month, v.archived])).toEqual([
      ["2026-09", true],
      ["2026-10", false],
    ]);
    expect(S.rows[0]).toMatchObject({ due: 96, paid: 96, cd: 1000, cpd: 1000 });
    expect(S.rows[1]).toMatchObject({ due: 96, paid: 0 });
    expect(S.cf).toBe(96); // Sep: due 72, paid 36 -> 36; Oct: due 120, paid 60 -> +60
    expect(S.acc[1].note).toMatch(/carried over from/);
  });
});
