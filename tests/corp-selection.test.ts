import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "test";
process.env.SEED_FLATS = "true"; // these tests use the sample roster (server/flats-seed.js)
process.env.DB_DRIVER = "neon"; // replaced by an in-memory Postgres (tests/neon-shim.js)
process.env.ADMIN_PASSWORD = "adminpw1";

let handler: any, admin: any;
async function call(method: string, body?: any, token?: any) {
  const out: { code?: number; body?: any } = {};
  const res = {
    setHeader() {},
    status(c) {
      out.code = c;
      return res;
    },
    json(o) {
      out.body = o;
      out.code ||= 200;
    },
  };
  await handler(
    {
      method,
      body,
      headers: token ? { authorization: "Bearer " + token } : {},
    },
    res,
  );
  return out;
}
const post = (body?: any, token: any = admin) => call("POST", body, token);
const get = (token: any = admin) => call("GET", undefined, token);
const exp = [{ description: "Bescom", amount: 2500 }];

beforeAll(async () => {
  handler = (await import("../api/app.js")).default;
  // Only "super-admin" exists out of the box (via ADMIN_PASSWORD); create the
  // "admin" account these tests run as, the same way a real deployment would.
  const superToken = (
    await call("POST", {
      action: "login",
      username: "super-admin",
      password: "adminpw1",
    })
  ).body.token;
  await call(
    "POST",
    {
      action: "saveUser",
      username: "admin",
      password: "adminpw1",
      role: "admin",
    },
    superToken,
  );
  admin = (
    await call("POST", {
      action: "login",
      username: "admin",
      password: "adminpw1",
    })
  ).body.token;
});

describe("Corp Fund eligibility", () => {
  it("a flat's Corp Fund switch is stored, kept when not sent, and offered to admins", async () => {
    const f = {
      action: "saveFlat",
      create: true,
      flat: "T-1",
      sl: 90,
      name: "Tester",
      type: "N",
      bua: 1000,
      uds: 300,
    };
    expect((await post(f)).body.ok).toBe(true);
    expect(
      (await get()).body.flats.find((x) => x.flat === "T-1").corp_excluded,
    ).toBe(false);
    await post({ ...f, create: false, corpExcluded: true });
    expect(
      (await get()).body.flats.find((x) => x.flat === "T-1").corp_excluded,
    ).toBe(true);
    await post({ ...f, create: false, name: "Renamed" }); // corpExcluded not sent -> kept
    expect(
      (await get()).body.flats.find((x) => x.flat === "T-1"),
    ).toMatchObject({ name: "Renamed", corp_excluded: true });
    await post({ ...f, create: false, corpExcluded: false });
    expect(
      (await get()).body.flats.find((x) => x.flat === "T-1").corp_excluded,
    ).toBe(false);
  });

  it("a month keeps its own Corp Fund list: saved with the month, kept by a later save that does not send it", async () => {
    await post({
      action: "saveMonth",
      month: "2026-11",
      expenses: exp,
      excludedCorpFlats: ["T-1"],
    });
    expect(
      (await get()).body.months.find((m) => m.month === "2026-11")
        .excluded_corp_flats,
    ).toEqual(["T-1"]);
    await post({ action: "saveMonth", month: "2026-11", expenses: exp }); // no list sent -> kept
    expect(
      (await get()).body.months.find((m) => m.month === "2026-11")
        .excluded_corp_flats,
    ).toEqual(["T-1"]);
    expect(
      (
        await post({
          action: "saveCorpSelection",
          month: "2026-11",
          excludedFlats: [],
        })
      ).code,
    ).toBe(400); // action removed
  });

  it("deleting a month freezes Corp Fund as ₹0 for an excluded flat", async () => {
    await post({ action: "saveCorpRate", month: "2026-11", rate: 0.5 });
    await post({ action: "deleteMonth", month: "2026-11" });
    const a = (await get()).body.archive.find((x) => x.month === "2026-11");
    expect(a.data.cdue["T-1"]).toBe(0);
    expect(a.data.cdue["101-3BHK"]).toBe(853); // 0.5 x 1706.26
  });
});

describe("Add month", () => {
  it("create:true refuses a month that already exists (saveMonth alone still updates)", async () => {
    expect(
      (
        await post({
          action: "saveMonth",
          month: "2020-01",
          expenses: exp,
          create: true,
        })
      ).body.ok,
    ).toBe(true);
    const again = await post({
      action: "saveMonth",
      month: "2020-01",
      expenses: [{ description: "Other", amount: 5 }],
      create: true,
    });
    expect(again.code).toBe(409);
    expect(
      (await get()).body.months.find((m) => m.month === "2020-01").expenses,
    ).toEqual(exp);
    expect(
      (
        await post({
          action: "saveMonth",
          month: "2020-01",
          expenses: [{ description: "Other", amount: 5 }],
        })
      ).body.ok,
    ).toBe(true);
  });
});

describe("Flats page switches", () => {
  it("apply to the latest month (and only that one); un-ticking removes the flat again", async () => {
    await post({ action: "saveMonth", month: "2027-01", expenses: exp });
    await post({ action: "saveMonth", month: "2027-02", expenses: exp });
    const f = {
      action: "saveFlat",
      create: false,
      flat: "T-1",
      sl: 90,
      name: "Renamed",
      type: "N",
      bua: 1000,
      uds: 300,
      excluded: false,
    };
    await post({ ...f, corpExcluded: true });
    let months = (await get()).body.months;
    expect(
      months.find((m) => m.month === "2027-02").excluded_corp_flats,
    ).toEqual(["T-1"]);
    expect(
      months.find((m) => m.month === "2027-01").excluded_corp_flats,
    ).toEqual([]); // earlier month untouched
    await post({ ...f, corpExcluded: true, name: "Same again" }); // nothing changed -> nothing re-applied
    await post({ ...f, corpExcluded: false });
    months = (await get()).body.months;
    expect(
      months.find((m) => m.month === "2027-02").excluded_corp_flats,
    ).toEqual([]);
    await post({ ...f, excluded: true, corpExcluded: false });
    expect(
      (await get()).body.months.find((m) => m.month === "2027-02")
        .excluded_flats,
    ).toContain("T-1");
    expect(
      (await get()).body.months.find((m) => m.month === "2027-01")
        .excluded_flats,
    ).not.toContain("T-1");
    await post({ ...f, excluded: false, corpExcluded: false });
    expect(
      (await get()).body.months.find((m) => m.month === "2027-02")
        .excluded_flats,
    ).not.toContain("T-1");
  });
});

describe("Corpus Fund ledger", () => {
  it("is sent to admins only", async () => {
    await post({
      action: "saveCorpusEntry",
      kind: "deposit",
      description: "FD interest",
      amount: 100,
    });
    expect((await get()).body.corpusLedger.length).toBeGreaterThan(0);
    await post({
      action: "saveUser",
      username: "view1",
      password: "viewer1234",
      role: "user",
    });
    const t = (
      await call("POST", {
        action: "login",
        username: "view1",
        password: "viewer1234",
      })
    ).body.token;
    expect((await get(t)).body.corpusLedger).toEqual([]);
  });
});

describe("settings", () => {
  it("defaults include Bescom Gym and Diesel and the maintenance-first split", async () => {
    const { settings } = (await get()).body;
    expect(settings.expenseHeads).toEqual([
      "Bescom",
      "BWSBB",
      "Garbage",
      "Security",
      "Bescom Gym",
      "Diesel",
    ]);
    expect(settings.paymentSplit).toBe("maint_first");
  });
  it("expense heads and the split rule are saved and cleaned", async () => {
    await post({
      action: "saveSettings",
      settings: {
        expenseHeads: [" Bescom ", "bescom", "Lift AMC", "", "Diesel"],
        paymentSplit: "corp_first",
      },
    });
    const { settings } = (await get()).body;
    expect(settings.expenseHeads).toEqual(["Bescom", "Lift AMC", "Diesel"]);
    expect(settings.paymentSplit).toBe("corp_first");
    await post({ action: "saveSettings", settings: { paymentSplit: "bogus" } });
    expect((await get()).body.settings.paymentSplit).toBe("maint_first");
  });
  it("a fixed head amount is kept only while its head still exists, and only when positive", async () => {
    await post({
      action: "saveSettings",
      settings: {
        expenseHeads: ["Security", "Diesel"],
        expenseHeadAmounts: { Security: 15000, Diesel: -5, Ghost: 999 },
      },
    });
    // "Diesel: -5" is dropped (not positive); "Ghost" is dropped (no such head).
    expect((await get()).body.settings.expenseHeadAmounts).toEqual({
      Security: 15000,
    });
    await post({
      action: "saveSettings",
      settings: { expenseHeads: ["Diesel"] },
    });
    // Removing "Security" from the heads list drops its stale amount too.
    expect((await get()).body.settings.expenseHeadAmounts).toEqual({});
  });
  it("a save that sends only some keys (like the Columns panel) does not reset the others", async () => {
    await post({
      action: "saveSettings",
      settings: {
        expenseValues: [25, 26],
        expenseHeads: ["A", "B"],
        paymentSplit: "proportional",
      },
    });
    await post({
      action: "saveSettings",
      settings: { hidden: ["texp"], custom: [], labels: { tpaid: "Total in" } },
    });
    const { settings } = (await get()).body;
    expect(settings).toMatchObject({
      hidden: ["texp"],
      labels: { tpaid: "Total in" },
      expenseValues: [25, 26],
      expenseHeads: ["A", "B"],
      paymentSplit: "proportional",
    });
  });
});

describe("schema upgrade", () => {
  it("a later version bump does not re-apply flat defaults over a month that selected all flats", async () => {
    const { sql, ensureSchema, SCHEMA_VERSION } =
      await import("../server/db.js");
    await post({
      action: "saveFlat",
      create: false,
      flat: "T-1",
      sl: 90,
      name: "Renamed",
      type: "N",
      bua: 1000,
      uds: 300,
      excluded: true,
    });
    await post({
      action: "saveMonth",
      month: "2026-12",
      expenses: exp,
      excludedFlats: [],
    }); // admin chose "select all"
    await sql.query(
      "UPDATE settings SET value=$1::jsonb WHERE key='schema_version'",
      [String(SCHEMA_VERSION - 1)],
    );
    const backupsBefore = (
      await sql.query("SELECT count(*)::int AS n FROM backups")
    )[0].n;
    await ensureSchema();
    expect(
      (await get()).body.months.find((m) => m.month === "2026-12")
        .excluded_flats,
    ).toEqual([]);
    // an existing database is backed up automatically before it is upgraded
    expect(
      (await sql.query("SELECT count(*)::int AS n FROM backups"))[0].n,
    ).toBe(backupsBefore + 1);
  });
  it("upgrading from before v10 carries the latest month's selection onto the Flats switches (calculations unchanged)", async () => {
    const { sql, ensureSchema, SCHEMA_VERSION } =
      await import("../server/db.js");
    await post({
      action: "saveMonth",
      month: "2099-01",
      expenses: exp,
      excludedFlats: ["101-3BHK"],
      excludedExpenseFlats: ["102-2BHK"],
      excludedCorpFlats: ["103-2BHK"],
    });
    await sql.query("UPDATE flats SET excluded=false, corp_excluded=false");
    await sql.query(
      "UPDATE settings SET value='9'::jsonb WHERE key='schema_version'",
    );
    await ensureSchema();
    const f = Object.fromEntries(
      (await get()).body.flats.map((x) => [x.flat, x]),
    );
    expect(f["101-3BHK"].excluded).toBe(true);
    expect(f["102-2BHK"].excluded).toBe(true); // the old separate "expense" list counts as maintenance-excluded too
    expect(f["103-2BHK"].corp_excluded).toBe(true);
    expect(f["104-2BHK"].excluded).toBe(false);
    // an existing installation keeps the name it has always shown
    expect((await get()).body.settings).toMatchObject({
      orgName: "RV Fallon Owners Association",
      orgShort: "RV Fallon",
    });
    expect(
      (
        await sql.query("SELECT value FROM settings WHERE key='schema_version'")
      )[0].value,
    ).toBe(SCHEMA_VERSION);
  });
});

describe("Corp Fund figures are visible to viewers; the ledger is not", () => {
  it("a viewer gets Corp Fund paid and the rate; only admins get the Corpus Fund ledger", async () => {
    await post({
      action: "saveMonth",
      month: "2027-03",
      expenses: exp,
      corpRate: 0.7,
    });
    await post({
      action: "savePayment",
      month: "2027-03",
      flat: "101-3BHK",
      maint: 100,
      corp: 250,
      mode: "UPI",
      date: "2027-03-02",
    });
    const pay = (r) =>
      r.body.payments.find(
        (p) => p.month === "2027-03" && p.flat === "101-3BHK",
      );
    await post({
      action: "saveUser",
      username: "view2",
      password: "viewer1234",
      role: "user",
      flat: "101-3BHK",
    });
    const t = (
      await call("POST", {
        action: "login",
        username: "view2",
        password: "viewer1234",
      })
    ).body.token;
    const v = await get(t);
    expect(v.body.months.find((m) => m.month === "2027-03").corp_rate).toBe(
      0.7,
    );
    expect(pay(v)).toMatchObject({ corp: 250 });
    expect(v.body.corpusLedger).toEqual([]);
    expect((await get()).body.corpusLedger.length).toBeGreaterThan(0);
  });
});

describe("billing and organisation settings", () => {
  it("defaults are neutral; billing is validated", async () => {
    const { settings } = (await get()).body;
    expect(settings.billing).toBeNull();
    expect(
      (
        await post({
          action: "saveSettings",
          settings: { billing: { method: "nope" } },
        })
      ).code,
    ).toBe(400);
    expect(
      (
        await post({
          action: "saveSettings",
          settings: { billing: { rounding: "sideways" } },
        })
      ).code,
    ).toBe(400);
    expect(
      (
        await post({
          action: "saveSettings",
          settings: { billing: { corpRate: -1 } },
        })
      ).code,
    ).toBe(400);
  });
  it("saving billing defaults applies them to the latest month only; the organisation name is stored", async () => {
    const before = (await get()).body.months;
    const latest = before.at(-1).month,
      earlier = before.at(-2);
    expect(
      (
        await post({
          action: "saveSettings",
          settings: {
            orgName: "  Sunrise Apartments Owners Association ",
            orgShort: "Sunrise",
            billing: {
              method: "sqft",
              value: 2.5,
              rounding: "up",
              corpRate: 0.8,
            },
          },
        })
      ).body.ok,
    ).toBe(true);
    const r = (await get()).body;
    expect(r.months.find((m) => m.month === latest)).toMatchObject({
      method: "sqft",
      value: 2.5,
      rounding: "up",
      corp_rate: 0.8,
    });
    expect(r.months.find((m) => m.month === earlier.month)).toMatchObject({
      method: earlier.method,
      value: earlier.value,
      corp_rate: earlier.corp_rate,
    });
    expect(r.settings).toMatchObject({
      orgName: "Sunrise Apartments Owners Association",
      orgShort: "Sunrise",
      billing: { method: "sqft", corpRate: 0.8 },
    });
    // a save that does not mention billing leaves the months alone
    await post({
      action: "saveSettings",
      settings: { paymentSplit: "corp_first" },
    });
    expect(
      (await get()).body.months.find((m) => m.month === latest).corp_rate,
    ).toBe(0.8);
  });
});
