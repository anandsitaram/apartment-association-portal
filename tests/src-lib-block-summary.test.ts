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
  it("uses normal association-wide billing when Is Blocks is off", () => {
    expect(maintOf(month, flats[0], flats, false)).toBe(533.33);
  });

  it("uses hybrid block allocation when Is Blocks is on", () => {
    expect(maintOf(month, flats[0], flats, true)).toBe(500);
    expect(maintOf(month, flats[1], flats, true)).toBe(500);
    expect(maintOf(month, flats[2], flats, true)).toBe(600);
  });

  it("freezes the same block-aware dues in summary snapshots", () => {
    const snapshot = snapshotOf(flats, month, [], true);
    expect(snapshot.due["A-101"]).toBe(500);
    expect(snapshot.due["B-101"]).toBe(600);
    expect(snapshot.expenses[1].allocationScope).toBe("block");
  });
});
