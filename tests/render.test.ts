import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MonthTab from "../src/components/MonthTab.jsx";
import Dashboard from "../src/components/Dashboard.jsx";
import Flats from "../src/components/Flats.jsx";
import MaintenanceSettings from "../src/components/MaintenanceSettings.jsx";
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
    expect(html).toContain("OWNERS ASSOCIATION – MAINTENANCE PAYMENT TRACKER"); // neutral until an organisation is set
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
  it("hiding a combined column in settings removes it from the month table", () => {
    const html = renderToStaticMarkup(
      h(MonthTab as any, {
        m,
        flats,
        pays: {},
        admin: true,
        hide: false,
        settings: { ...settings, hidden: ["texp", "tpaid"] },
        onSave: noop,
        ledger: [],
      }),
    );
    expect(html).not.toContain("Expected Total (Maint + Corp Fund)");
    expect(html).not.toContain("Actual Total Paid (Maint + Corp Fund)");
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
    expect(html).toContain("Corp Due");
    expect(html).toContain("Total Due (Maint + Corp)");
    expect(html).toContain("Corpus");
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
    expect(html).toContain("Total Due (Maint + Corp)");
    expect(html).toContain("Total Paid (Maint + Corp)");
    expect(html).toContain("Total Balance");
    // due: maintenance 1900 + 1900, Corp Fund 600 for 104 only (105 is excluded) = 4,400; paid 1900 + 600
    expect(html).toContain("4,400.00");
    expect(html).toContain("2,500.00");
  });
  it("flats page has a Corp Fund checkbox next to the maintenance one", () => {
    const html = renderToStaticMarkup(
      h(Flats as any, { flats, onSave: noop, superAdmin: false }),
    );
    expect(html).toContain("Maint. excluded");
    expect(html).toContain("Corp Fund excluded");
    expect(html).toContain("Exclude flat 105 from Corp Fund");
  });
  it("settings offer the expense heads and the split rule", () => {
    const html = renderToStaticMarkup(
      h(MaintenanceSettings as any, { settings, onSave: noop }),
    );
    expect(html).toContain("Bescom Gym");
    expect(html).toContain("Diesel");
    expect(html).toContain("Organisation");
    expect(html).toContain("Billing");
    expect(html).toContain("Corp Fund rate");
    expect(html).toContain("Round off");
    expect(html).toContain("Maintenance first, then Corp Fund");
    expect(html).toContain("Proportional to the amounts due");
  });
  it("the expenses block lists configured heads that are not yet in the month", () => {
    const html = renderToStaticMarkup(
      h(Expenses as any, { m, admin: true, onSave: noop, settings }),
    );
    expect(html).toContain('<option value="Diesel">Diesel</option>');
    expect(html).toContain('<option value="Bescom Gym">Bescom Gym</option>');
    // how maintenance is calculated is not edited here any more
    expect(html).toContain("Settings → Billing");
    expect(html).not.toContain('type="radio"');
  });
});
