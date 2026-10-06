import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MonthTab } from "../src/features/months/index.js";
import Dashboard from "../src/features/dashboard/index.js";
import Flats from "../src/features/flats/index.js";
import MaintenanceSettings from "../src/features/settings/index.js";
import Expenses from "../src/components/Expenses.jsx";

const flats = [
  { flat: "104", sl: 1, name: "Owner", type: "N", bua: 1200, uds: 300 },
  {
    flat: "105",
    sl: 2,
    name: "Other",
    type: "N",
    bua: 1000,
    uds: 250,
    corp_excluded: true,
  },
];
const m = {
  month: "2026-09",
  expenses: [{ description: "Bescom", amount: 1900 }],
  method: "common",
  value: 1900,
  rounding: "none",
  corp_rate: 0.5,
  excluded_flats: [],
  excluded_expense_flats: [],
  excluded_corp_flats: ["105"],
};
const settings = {
  hidden: [],
  custom: [],
  labels: {},
  expenseValues: [25],
  maintenanceValues: [25],
  expenseHeads: ["Bescom", "Bescom Gym", "Diesel"],
  paymentSplit: "maint_first",
};
const noop = () => {};

describe("screens render", () => {
  it("month tab (admin): the combined columns and totals; no selection cards, no per-month configuration", () => {
    const html = renderToStaticMarkup(
      h(MonthTab as any, {
        m,
        flats,
        pays: { 104: { maint: 1900, corp: 600 } },
        admin: true,
        hide: false,
        settings,
        onSave: noop,
        ledger: [],
      }),
    );
    expect(html).toContain("Expected Total (Maint + Corp Fund)");
    expect(html).toContain("Actual Total Paid (Maint + Corp Fund)");
    expect(html).toContain("2,500.00"); // 104 expected: 1900 + 600
    expect(html).toContain('value="2500"'); // its total-paid box
    expect(html).toContain("1,900.00"); // 105 (excluded from Corp Fund in the month's list): maintenance only
    expect(html).toContain("Add from list");
    expect(html).not.toContain("flat selection");
    expect(html).not.toContain("flats included");
    expect(html).not.toContain("Columns</button>"); // column settings live in Settings now
    expect(html).not.toContain("<b>Corp Fund rate</b>"); // the rate is a Settings → Billing item (only a pointer remains)
    expect(html).not.toContain('type="radio"'); // no calculation-method options on the month tab
    expect(html).toContain("MY APARTMENT – MAINTENANCE PAYMENT TRACKER");
  });
  it("the title follows the organisation name from Settings", () => {
    const html = renderToStaticMarkup(
      h(MonthTab as any, {
        m,
        flats,
        pays: {},
        admin: true,
        hide: false,
        settings: { ...settings, orgName: "Sunrise Apartments" },
        onSave: noop,
        ledger: [],
      }),
    );
    expect(html).toContain("SUNRISE APARTMENTS – MAINTENANCE PAYMENT TRACKER");
  });
  it("month tab (viewer / guest): the same figures including Corp Fund, but no controls", () => {
    const html = renderToStaticMarkup(
      h(MonthTab as any, {
        m,
        flats,
        pays: { 104: { maint: 1900, corp: 600 } },
        admin: false,
        hide: false,
        settings,
        onSave: noop,
        ledger: [],
      }),
    );
    expect(html).toContain("Corp Fund");
    expect(html).toContain("Expected Total (Maint + Corp Fund)");
    expect(html).toContain("2,500.00");
    expect(html).not.toContain("Save All");
    expect(html).not.toContain("Add from list");
    expect(html).not.toContain('class="pri"');
  });
  it("hiding identity columns leaves the combined payment columns intact", () => {
    const html = renderToStaticMarkup(
      h(MonthTab as any, {
        m,
        flats,
        pays: {},
        admin: true,
        hide: false,
        settings: { ...settings, hidden: ["name", "bua"] },
        onSave: noop,
        ledger: [],
      }),
    );
    expect(html).not.toContain("Owner");
    expect(html).not.toMatch(/<th[^>]*>Sq Ft<\/th>/);
    expect(html).toContain("Expected Total (Maint + Corp Fund)");
    expect(html).toContain("Actual Total Paid (Maint + Corp Fund)");
  });
  it("dashboard shows Corp Fund to viewers and guests too", () => {
    const data = {
      months: [m],
      payments: [{ month: "2026-09", flat: "104", maint: 1900, corp: 600 }],
      archive: [],
      flats,
      settings,
    };
    const html = renderToStaticMarkup(
      h(Dashboard as any, {
        data,
        flats,
        month: "2026-09",
        onMonthChange: noop,
        admin: false,
        onAddMonth: noop,
        loading: false,
      }),
    );
    expect(html).toContain("Maintenance + Corp Fund collected");
    expect(html).toContain("Maintenance + Corp Fund due");
    expect(html).toContain("Corp Fund");
  });
  it("dashboard shows carry-forward source month and flat-level amounts to admins", () => {
    const carryMonth = {
      ...m,
      month: "2026-10",
      notes: {
        carryForward: {
          "104": { maintenance: 900, corp: 250, combined: false },
          "105": { maintenance: 1500, corp: 0, combined: true },
        },
      },
    };
    const data = {
      months: [m, carryMonth],
      payments: [],
      archive: [],
      flats,
      settings,
    };
    const html = renderToStaticMarkup(
      h(Dashboard as any, {
        data,
        flats,
        month: "2026-10",
        onMonthChange: noop,
        admin: true,
        onAddMonth: noop,
        loading: false,
      }),
    );
    expect(html).toContain("Carried-forward flat details");
    expect(html).toContain("carried forward since");
    expect(html).toContain("September 2026");
    expect(html).toContain("104");
    expect(html).toContain("Owner");
    expect(html).toContain("Other");
    expect(html).toContain("Combined arrears (in Maintenance)");
    expect(html).toContain("Separate Maintenance + Corp Fund");
    expect(html).toContain("2,650.00");
  });

  it("does not show other flats' carry-forward details to non-admin dashboard viewers", () => {
    const carryMonth = {
      ...m,
      month: "2026-10",
      notes: {
        carryForward: {
          "104": { maintenance: 900, corp: 250, combined: false },
          "105": { maintenance: 1500, corp: 0, combined: true },
        },
      },
    };
    const data = {
      months: [m, carryMonth],
      payments: [],
      archive: [],
      flats,
      settings,
    };
    const html = renderToStaticMarkup(
      h(Dashboard as any, {
        data,
        flats,
        month: "2026-10",
        onMonthChange: noop,
        admin: false,
        onAddMonth: noop,
        loading: false,
      }),
    );
    expect(html).not.toContain("Carried-forward flat details");
    expect(html).not.toContain("Separate Maintenance + Corp Fund");
  });

  it("dashboard shows the combined due / collected figures", () => {
    const data = {
      months: [m],
      payments: [{ month: "2026-09", flat: "104", maint: 1900, corp: 600 }],
      archive: [],
      flats,
      settings,
    };
    const html = renderToStaticMarkup(
      h(Dashboard as any, {
        data,
        flats,
        month: "2026-09",
        onMonthChange: noop,
        admin: true,
        onAddMonth: noop,
        loading: false,
      }),
    );
    expect(html).toContain("Maintenance + Corp Fund collected");
    expect(html).toContain("Maintenance + Corp Fund due");
    expect(html).toContain("Maintenance + Corp Fund pending from flats");
    // due: maintenance 1900 + 1900, Corp Fund 600 for 104 only (105 is excluded) = 4,400; paid 1900 + 600
    expect(html).toContain("4,400.00");
    expect(html).toContain("2,500.00");
  });
  it("flats page has a Corp Fund checkbox next to the maintenance one", () => {
    const html = renderToStaticMarkup(
      h(Flats as any, {
        flats,
        settings,
        onSave: noop,
        superAdmin: false,
      }),
    );
    expect(html).toContain("Maint. excluded");
    expect(html).toContain("Corp Fund excluded");
    expect(html).toContain("Exclude flat 105 from Corp Fund");
  });
  it("settings show section navigation and organisation settings by default", () => {
    const html = renderToStaticMarkup(
      h(MaintenanceSettings as any, { settings, onSave: noop }),
    );
    expect(html).toContain("Expenses &amp; Payments");
    expect(html).toContain("Organisation");
  });
  it("the expenses block lists configured heads that are not yet in the month", () => {
    const html = renderToStaticMarkup(
      h(Expenses as any, { m, flats, admin: true, onSave: noop, settings }),
    );
    expect(html).toContain('<option value="Diesel">Diesel</option>');
    expect(html).toContain('<option value="Bescom Gym">Bescom Gym</option>');
    // how maintenance is calculated is not edited here any more
    expect(html).toContain("Settings → Expenses");
    expect(html).not.toContain('type="radio"');
  });
});
