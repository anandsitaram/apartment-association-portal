// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MonthTab } from "../src/features/months/index.js";
import App from "../src/App.jsx";
import Dashboard from "../src/features/dashboard/index.js";
import MaintenanceSettings from "../src/features/settings/index.js";
import Backup from "../src/components/Backup.jsx";
import Expenses from "../src/components/Expenses.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flats = [
  { flat: "104", sl: 1, name: "Owner", type: "N", bua: 1200, uds: 300 },
  { flat: "105", sl: 2, name: "Other", type: "N", bua: 1000, uds: 250 },
];
const month = {
  month: "2026-09",
  expenses: [{ description: "Bescom", amount: 1900 }],
  method: "common",
  value: 1900,
  rounding: "none",
  corp_rate: 0.5,
  corp_applicable: true,
  excluded_flats: [],
  excluded_expense_flats: [],
  excluded_corp_flats: ["105"], // 105 pays no Corp Fund
};
const baseSettings = {
  hidden: [],
  custom: [],
  labels: {},
  flatHidden: [],
  expenseHeads: ["Bescom"],
  paymentSplit: "maint_first",
};

async function mount(node: any) {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(node));
  return {
    el: el as any,
    done: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
}
const typeInto = async (input: any, value: string) => {
  const set = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView.HTMLInputElement.prototype,
    "value",
  ).set;
  await act(async () => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const row = (el: any, flat: string) =>
  [...el.querySelectorAll('[aria-label="Maintenance payments"] tbody tr')].find((tr) =>
    tr.textContent.includes(flat),
  );
const corpRow = (el: any, flat: string) =>
  [...el.querySelectorAll('[aria-label="Corp Fund payments"] tbody tr')].find((tr) =>
    tr.textContent.includes(flat),
  );
// the three inputs of a row in column order: maint paid, corp paid, total paid
const paidBoxes = (tr: any): any[] => [
  ...tr.querySelectorAll("input[type=number]"),
];

describe("month table: Actual Total Paid", () => {
  it("typing a total splits it into maintenance and Corp Fund (Flat 104: 2500 = 1900 + 600)", async () => {
    const { el, done } = await mount(
      h(MonthTab as any, {
        m: month,
        flats,
        pays: {},
        admin: true,
        hide: false,
        settings: baseSettings,
        onSave: async () => true,
        ledger: [],
      }),
    );
    const [maint, total] = paidBoxes(row(el, "104"));
    await typeInto(total, "2500");
    expect([maint.value, total.value]).toEqual(["1900", "2500"]);
    await typeInto(total, "1500"); // a short payment fills maintenance first
    expect([maint.value, total.value]).toEqual(["1500", "1500"]);
    await typeInto(total, "1250.5"); // decimals can be typed without the box rewriting itself
    expect(total.value).toBe("1250.5");
    await typeInto(total, "");
    expect([maint.value, total.value]).toEqual(["", ""]);
    await typeInto(maint, "1000"); // editing a part by hand: the total box follows
    expect(total.value).toBe("1000");

    const [corp] = paidBoxes(corpRow(el, "104"));
    await typeInto(corp, "100");
    expect(corp.value).toBe("100");
    done();
  });
  it("uses the split rule from Settings", async () => {
    const { el, done } = await mount(
      h(MonthTab as any, {
        m: month,
        flats,
        pays: {},
        admin: true,
        hide: false,
        settings: { ...baseSettings, paymentSplit: "corp_first" },
        onSave: async () => true,
        ledger: [],
      }),
    );
    const [maint, total] = paidBoxes(row(el, "104"));
    await typeInto(total, "500");
    expect([maint.value, total.value]).toEqual(["0", "500"]);
    done();
  });
  it("Bulk fill: one total per flat, split by that flat's own dues", async () => {
    const { el, done } = await mount(
      h(MonthTab as any, {
        m: month,
        flats,
        pays: {},
        admin: true,
        hide: false,
        settings: baseSettings,
        onSave: async () => true,
        ledger: [],
      }),
    );
    await act(async () =>
      [...el.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Bulk fill"))
        .click(),
    );
    const totalBox = [...el.querySelectorAll("label.opt")]
      .find((l) => l.textContent.startsWith("Total paid"))
      .querySelector("input");
    await typeInto(totalBox, "2500");
    await act(async () =>
      [...el.querySelectorAll("button")]
        .find((b) => b.textContent === "Apply to flats")
        .click(),
    );
    // The maintenance table shows the combined amount; the Corp Fund table shows its split.
    expect(
      paidBoxes(row(el, "104"))
        .slice(0, 2)
        .map((i) => i.value),
    ).toEqual(["1900", "2500"]);
    expect(
      paidBoxes(row(el, "105"))
        .slice(0, 2)
        .map((i) => i.value),
    ).toEqual(["1900", "2500"]);
    expect(paidBoxes(corpRow(el, "104"))[0].value).toBe("600");
    expect(paidBoxes(corpRow(el, "105"))[0].value).toBe("600");
    done();
  });
});

describe("App shell", () => {
  const snap = (role: any, extra = {}): any => ({
    months: [month],
    payments: [],
    archive: [],
    flats,
    corpusLedger: [],
    features: {},
    residentOnly: false,
    settings: {
      ...baseSettings,
      orgName: "Sunrise Apartments Owners Association",
      orgShort: "Sunrise",
    },
    me: role && { name: "u", role },
    ...extra,
  });
  async function open(role: any, click?: string) {
    localStorage.clear();
    sessionStorage.clear();
    if (role)
      sessionStorage.setItem(
        "rv_auth",
        JSON.stringify({ token: "t", user: { name: "u", role } }),
      );
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(snap(role)),
    })) as any;
    const { el, done } = await mount(h(App));
    await act(async () => {});
    if (click)
      await act(async () =>
        [...el.querySelectorAll(".side-nav button")]
          .find((b) => b.textContent === click)
          .click(),
      );
    const q = (sel: string): any[] => [...el.querySelectorAll(sel)];
    const info = {
      nav: q(".side-nav button").map((b) => b.textContent),
      add: q(".heading-actions button").filter((b) =>
        /Add month/.test(b.textContent),
      ).length,
      names: q(".heading-actions .icon-button").length,
      brand: el.querySelector(".brand strong")?.textContent,
      mark: el.querySelector(".brand-mark")?.textContent,
      html: el.innerHTML,
    };
    done();
    return info;
  }
  it("keeps the application brand fixed while naming the selected page in the browser title", async () => {
    const a = await open("admin", "Months");
    expect(a.brand).toBe("My Apartment");
    expect(a.mark).toBe("MA");
    expect(document.title).toBe("Months · My Apartment");
    expect(a.html).toContain("Months");
  });
  it("Corpus Fund is in the menu for admins only (viewers and guests do not get it)", async () => {
    expect((await open("admin")).nav).toContain("Corpus Fund");
    expect((await open("user")).nav).not.toContain("Corpus Fund");
    expect((await open(null)).nav).not.toContain("Corpus Fund");
  });
  it("+ Add month only on the Months page; the names toggle only where names are shown", async () => {
    const months = await open("admin", "Months");
    expect([months.add, months.names]).toEqual([1, 0]);
    const summary = await open("admin", "Financial Summary");
    expect([summary.add, summary.names]).toEqual([0, 0]);
    for (const page of ["Flats", "Settings"]) {
      const p = await open("admin", page);
      expect([page, p.add, p.names]).toEqual([page, 0, 0]);
    }
    const viewer = await open("user");
    expect([viewer.add, viewer.names]).toEqual([0, 0]);
  });
});

describe("Add month dialog", () => {
  it("offers the copy choices and sends exactly what was chosen", async () => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(
      "rv_auth",
      JSON.stringify({ token: "t", user: { name: "u", role: "admin" } }),
    );
    const bodies: any[] = [];
    const data = {
      months: [month],
      payments: [],
      archive: [],
      flats,
      corpusLedger: [],
      features: {},
      residentOnly: false,
      settings: {
        ...baseSettings,
        billing: {
          method: "divide",
          value: 30,
          rounding: "none",
          corpRate: 0.5,
        },
      },
      me: { name: "u", role: "admin" },
    };
    globalThis.fetch = vi.fn(async (_u: any, init: any) => {
      if (init?.body) bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }) as any;
    const { el, done } = await mount(h(App));
    await act(async () => {});
    await act(async () =>
      ([...el.querySelectorAll(".side-nav button")] as any[])
        .find((b) => b.textContent === "Months")
        .click(),
    );
    await act(async () =>
      ([...el.querySelectorAll("button")] as any[])
        .find((b) => /Add month/.test(b.textContent))
        .click(),
    );
    const dlg = el.querySelector('[role="dialog"]');
    expect(dlg.textContent).toContain("Copy from");
    expect(dlg.textContent).toContain("Payments are never copied");
    expect(
      el.querySelector('button[aria-label="Select month to add"]').textContent,
    ).toContain("October 2026");
    // choose: lines with amounts, calculation from the source month, flats as on the Flats page
    const pick = async (text: string) =>
      await act(async () =>
        ([...dlg.querySelectorAll("label.opt")] as any[])
          .find((l) => l.textContent.includes(text))
          .querySelector("input")
          .click(),
      );
    await pick("with Sept 2026's amounts");
    await pick("As in Sept 2026"); // first match = calculation
    await pick("As ticked on the Flats page");
    await act(async () =>
      ([...dlg.querySelectorAll("button")] as any[])
        .find((b) => b.textContent === "Create month")
        .click(),
    );
    const sent = bodies.find((b) => b.action === "saveMonth");
    expect(sent).toMatchObject({
      create: true,
      month: "2026-10",
      method: "common",
      value: 1900,
      corpRate: 0.5,
      expenses: [{ description: "Bescom", amount: 1900 }],
    });
    expect(sent.excludedFlats).toEqual([]);
    done();
  });
  it("will not create a month that already exists", async () => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(
      "rv_auth",
      JSON.stringify({ token: "t", user: { name: "u", role: "admin" } }),
    );
    const data = {
      months: [month],
      payments: [],
      archive: [],
      flats,
      corpusLedger: [],
      features: {},
      residentOnly: false,
      settings: baseSettings,
      me: { name: "u", role: "admin" },
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
    })) as any;
    const { el, done } = await mount(h(App));
    await act(async () => {});
    await act(async () =>
      ([...el.querySelectorAll(".side-nav button")] as any[])
        .find((b) => b.textContent === "Months")
        .click(),
    );
    await act(async () =>
      ([...el.querySelectorAll("button")] as any[])
        .find((b) => /Add month/.test(b.textContent))
        .click(),
    );
    await act(async () =>
      el.querySelector('button[aria-label="Select month to add"]').click(),
    );
    const picker = el.querySelector(
      '[role="dialog"][aria-label="Select month to add"]',
    );
    const september = [...picker.querySelectorAll(".month-picker-grid button")].find(
      (button: any) => /^Sep/.test(button.textContent),
    ) as HTMLButtonElement;
    await act(async () => september.click());
    const dlg = el.querySelector('[role="dialog"]');
    expect(dlg.textContent).toContain("Sept 2026 already exists");
    expect(
      ([...dlg.querySelectorAll("button")] as any[]).find(
        (b) => b.textContent === "Create month",
      ).disabled,
    ).toBe(true);
    done();
  });
});

describe("Settings → Billing", () => {
  it("saves expense heads and payment split independently", async () => {
    const calls: any[] = [];
    localStorage.setItem("rv_settings_tab", JSON.stringify("expenses"));
    const { el, done } = await mount(
      h(MaintenanceSettings as any, {
        settings: { ...baseSettings, expenseHeads: ["Bescom", "Diesel"] },
        months: [month],
        onSave: async (b: any) => calls.push(b),
      }),
    );
    expect(el.textContent).toContain("Bescom");
    expect(el.textContent).toContain("Diesel");
    expect(el.textContent).toContain("Actual Total Paid – how it is split");
    const radios = [...el.querySelectorAll('input[name="paymentSplit"]')];
    await act(async () => radios[1].click());
    const save = [...el.querySelectorAll("button")].find((button: any) =>
      button.textContent.includes("Save Expenses settings"),
    ) as HTMLButtonElement;
    await act(async () => save.click());
    expect(calls[0].settings).toMatchObject({
      expenseHeads: ["Bescom", "Diesel"],
      paymentSplit: "corp_first",
    });
    done();
  });
});

describe("Months tab: payment status filter", () => {
  it("filters the visible rows by paid / unpaid / excluded", async () => {
    const { el, done } = await mount(
      h(MonthTab as any, {
        m: month,
        flats,
        // 104: fully paid (1900+600); 105: unpaid (corp-excluded, so due is maintenance only, nothing paid)
        pays: { 104: { maint: 1900, corp: 600 } },
        admin: true,
        hide: false,
        settings: baseSettings,
        onSave: async () => true,
        ledger: [],
      }),
    );
    const rowsShown = () =>
      el.querySelectorAll('[aria-label="Maintenance payments"] tbody tr')
        .length;
    expect(rowsShown()).toBe(2);
    const select = el.querySelector("select[value], select");
    const pick = async (value: string) => {
      const sel = [...el.querySelectorAll("select")].find((s: any) =>
        [...s.options].some((o: any) => o.value === "paid"),
      ) as HTMLSelectElement;
      const setVal = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )!.set!;
      await act(async () => {
        setVal.call(sel, value);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await pick("paid");
    expect(rowsShown()).toBe(1);
    expect(row(el, "104")).toBeTruthy();
    await pick("unpaid");
    expect(rowsShown()).toBe(1);
    expect(row(el, "105")).toBeTruthy();
    await pick("all");
    expect(rowsShown()).toBe(2);
    done();
  });
});

describe("Dashboard: payment status", () => {
  it("shows the current combined financial overview", async () => {
    const data = {
      months: [month],
      payments: [{ month: "2026-09", flat: "104", maint: 1900, corp: 600 }],
      archive: [],
      flats,
      settings: baseSettings,
    };
    const { el, done } = await mount(
      h(Dashboard as any, {
        data,
        flats,
        month: "2026-09",
        onMonthChange: () => {},
        admin: true,
        onAddMonth: () => {},
        loading: false,
      }),
    );
    expect(el.textContent).toContain("Monthly process");
    expect(el.textContent).toContain("Maintenance + Corp Fund collected");
    done();
  });
});

describe("Backup: danger zone visibility", () => {
  it("hides the danger zone entirely from a plain admin", async () => {
    const { el, done } = await mount(
      h(Backup as any, {
        token: "t",
        features: { autoBackup: false } as any,
        superAdmin: false,
      }),
    );
    expect(el.textContent).not.toContain("Danger zone");
    expect(el.textContent).not.toContain(
      "Only a Super Admin can clear all data",
    );
    done();
  });

  it("shows the clear-all-data control to a super admin", async () => {
    const { el, done } = await mount(
      h(Backup as any, {
        token: "t",
        features: { autoBackup: false } as any,
        superAdmin: true,
      }),
    );
    expect(el.textContent).toContain("Danger zone");
    expect(el.textContent).toContain("Clear all data in the database");
    done();
  });
});

describe("maintenance recalculation", () => {
  it("uses current actual expenses when the saved calculation basis is stale zero", async () => {
    const onSave = vi.fn(async () => true);
    const m = {
      month: "2026-10",
      expenses: [
        { description: "Bescom", amount: 4000 },
        { description: "Garbage", amount: 6000 },
        { description: "Security", amount: 0 },
        { description: "Diesel", amount: 0 },
        { description: "Other", amount: 31999 },
      ],
      method: "divide",
      value: 28,
      rounding: "up",
      corp_rate: 0.5,
      corp_value: 0.5,
      corp_applicable: false,
      excluded_flats: [],
      excluded_expense_flats: [],
      excluded_corp_flats: [],
      calculated_expense_total: 0,
      notes: { expensesStage: "actual" },
    };
    const { el, done } = await mount(
      h(Expenses as any, {
        m,
        flats: Array.from({ length: 28 }, (_, i) => ({
          flat: String(i + 1),
          sl: i + 1,
          name: `Owner ${i + 1}`,
          type: "N",
          bua: 1200,
          uds: 300,
        })),
        admin: true,
        superAdmin: false,
        onSave,
        settings: baseSettings,
      }),
    );
    const editButton = [...el.querySelectorAll("button")].find((b: any) =>
      b.textContent.includes("Edit maintenance calculation"),
    ) as HTMLButtonElement;
    await act(async () => editButton.click());
    const recalculateButton = [...el.querySelectorAll("button")].find(
      (b: any) => b.textContent.includes("Save & recalculate maintenance"),
    ) as HTMLButtonElement;
    await act(async () => recalculateButton.click());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        calculatedExpenseTotal: 41999,
        recalculate: true,
        month: "2026-10",
      }),
    );
    done();
  });
});
