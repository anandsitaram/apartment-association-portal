import { describe, expect, it } from "vitest";
import {
  expenseTotalForRecalculation,
  snapshotOf,
} from "../server/calculations.js";

describe("server maintenance billing basis", () => {
  it("rebuilds the billing basis from current expense rows on explicit recalculation", () => {
    const expenses = [
      { description: "Electricity", amount: 65000 },
      { description: "Security", amount: 15000 },
      { description: "Repairs", amount: 10000 },
    ];

    expect(expenseTotalForRecalculation(expenses, 0, true)).toBe(90000);
    expect(expenseTotalForRecalculation(expenses, 1234, true)).toBe(90000);
  });

  it("preserves the saved billing basis when actual expenses are saved without recalculation", () => {
    const expenses = [{ description: "Updated actual expense", amount: 90000 }];
    expect(expenseTotalForRecalculation(expenses, 42000, false)).toBe(42000);
  });

  it("uses current expenses if no prior billing basis exists", () => {
    expect(expenseTotalForRecalculation([{ amount: 90000 }], null, false)).toBe(
      90000,
    );
  });

  it("keeps carried-forward maintenance and Corp Fund arrears in the server snapshot", () => {
    const snapshot = snapshotOf(
      "2026-10",
      {
        month: "2026-10",
        expenses: [{ description: "Actual expenses", amount: 90000 }],
        method: "divide",
        value: 28,
        rounding: "up",
        corp_applicable: false,
        notes: {
          carryForward: {
            "101-3BHK": { maintenance: 900, corp: 250, combined: false },
          },
        },
      },
      [{ flat: "101-3BHK", bua: 1700 }],
      [],
    );

    expect(snapshot.due["101-3BHK"]).toBe(4115); // ceil(90000 / 28) + carried Maintenance
    expect(snapshot.cdue["101-3BHK"]).toBe(250); // no new Corp Fund charge; existing arrears remain visible
  });
  it("archives block-aware dues when Is Blocks is enabled", () => {
    const month = {
      month: "2026-10",
      expenses: [
        { description: "Shared", amount: 900, allocationScope: "association" },
        {
          description: "Lift repair",
          amount: 400,
          allocationScope: "block",
          block: "A",
        },
      ],
      method: "divide",
      value: 3,
      rounding: "none",
    };
    const flats = [
      { flat: "A-101", bua: 1000, block: "A" },
      { flat: "A-102", bua: 1000, block: "A" },
      { flat: "B-101", bua: 1000, block: "B" },
    ];
    const snapshot = snapshotOf("2026-10", month, flats, [], true);
    expect(snapshot.due["A-101"]).toBeCloseTo(500, 6);
    expect(snapshot.due["A-102"]).toBeCloseTo(500, 6);
    expect(snapshot.due["B-101"]).toBeCloseTo(300, 6);
    expect(snapshot.expenses[1].allocationScope).toBe("block");
    expect(snapshot.expenses[1].block).toBe("A");
    const normalSnapshot = snapshotOf("2026-10", month, flats, [], false);
    expect(normalSnapshot.due["A-101"]).toBe(433.33);
  });
});
