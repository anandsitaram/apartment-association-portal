import { describe, expect, it } from "vitest";
import { maintOf, snapshotOf } from "../src/lib.js";

const flats: any[] = [
  {
    flat: "A-101",
    block: "A",
    bua: 1000,
    uds: 300,
    sl: 1,
    name: "A101",
    type: "2BHK",
  },
  {
    flat: "A-102",
    block: "A",
    bua: 1000,
    uds: 300,
    sl: 2,
    name: "A102",
    type: "2BHK",
  },
  {
    flat: "B-101",
    block: "B",
    bua: 1000,
    uds: 300,
    sl: 3,
    name: "B101",
    type: "2BHK",
  },
];

const month: any = {
  month: "2026-09",
  method: "divide",
  value: 3,
  rounding: "none",
  expenses: [
    { description: "Security", amount: 900, allocationScope: "association" },
    {
      description: "Lift repair",
      amount: 400,
      allocationScope: "block",
      block: "A",
    },
    {
      description: "Painting",
      amount: 300,
      allocationScope: "block",
      block: "B",
    },
  ],
};

describe("duplicate src/lib summary calculation", () => {
  it("divides all expense lines association-wide", () => {
    expect(maintOf(month, flats[0])).toBe(533.33);
    expect(maintOf(month, flats[1])).toBe(533.33);
    expect(maintOf(month, flats[2])).toBe(533.33);
  });

  it("freezes those dues and preserves expense allocation metadata", () => {
    const snapshot = snapshotOf(flats, month, []);
    expect(snapshot.due["A-101"]).toBe(533.33);
    expect(snapshot.due["B-101"]).toBe(533.33);
    expect(snapshot.expenses[1].allocationScope).toBe("block");
  });
});
