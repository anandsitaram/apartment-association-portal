import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "test";
process.env.SEED_FLATS = "true"; // these tests use the sample roster (server/flats-seed.js)
process.env.DB_DRIVER = "neon"; // the neon module is replaced by an in-memory Postgres (tests/neon-shim.js)
process.env.ADMIN_PASSWORD = "pw";

let handler: any, token: any;
const call = async (method: string, body?: any, tok: any = token) => {
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
    { method, body, headers: tok ? { authorization: "Bearer " + tok } : {} },
    res,
  );
  return out;
};
const post = (body?: any, tok?: any) => call("POST", body, tok);
const get = (tok?: any) => call("GET", undefined, tok);
const exp = [
  { description: "Bescom", amount: 1000 },
  { description: "Security", amount: 500 },
];

beforeAll(async () => {
  handler = (await import("../api/app.js")).default;
  token = (
    await post({ action: "login", username: "admin", password: "pw" }, null)
  ).body.token;
});

describe("auth", () => {
  it("rejects a wrong password and unauthenticated writes", async () => {
    expect((await post({ action: "login", password: "x" }, null)).code).toBe(
      401,
    );
    expect(
      (await post({ action: "saveCorpRate", month: "2026-09", rate: 1 }, null))
        .code,
    ).toBe(401);
  });
});

describe("months and Corp Fund rate", () => {
  it("defaults to 0.5, is kept by an expenses save, validated, copied to a new month", async () => {
    await post({
      action: "saveMonth",
      month: "2026-09",
      expenses: exp,
      method: "divide",
      value: 25,
    });
    expect((await get()).body.months[0].corp_rate).toBe(0.5);
    expect(
      (await post({ action: "saveCorpRate", month: "2026-09", rate: 0.75 }))
        .body.ok,
    ).toBe(true);
    await post({
      action: "saveMonth",
      month: "2026-09",
      expenses: exp,
      method: "sqft",
      value: 2,
    });
    expect((await get()).body.months[0].corp_rate).toBe(0.75);
    for (const rate of [-1, "abc", "", null, 5000])
      expect(
        (await post({ action: "saveCorpRate", month: "2026-09", rate })).code,
      ).toBe(400);
    await post({
      action: "saveMonth",
      month: "2026-10",
      expenses: exp,
      corpRate: 0.6,
    });
    expect(
      (await get()).body.months.find((m) => m.month === "2026-10").corp_rate,
    ).toBe(0.6);
  });
});

describe("column settings", () => {
  it("stores hidden keys and display names, dropping junk", async () => {
    await post({
      action: "saveSettings",
      settings: {
        hidden: ["name", "s_name", "bad key!"],
        custom: [{ id: "c1", name: "Remarks" }],
        labels: { bua: "Area", s_months: "Received", corp: "  ", "x y": "no" },
      },
    });
    const { settings } = (await get()).body;
    expect(settings.hidden).toEqual(["name", "s_name"]);
    expect(settings.labels).toEqual({ bua: "Area", s_months: "Received" });
  });
});

describe("flats", () => {
  it("is seeded once with the built-in list; non-admins get no owner names", async () => {
    const admin = (await get()).body.flats;
    expect(admin.length).toBe(28);
    expect(admin[0]).toMatchObject({ flat: "101-3BHK", name: "Alex Morgan" });
    const viewer = (await get(null)).body.flats;
    expect(viewer.length).toBe(28);
    expect(viewer.every((f) => f.name === "")).toBe(true);
  });

  it("adds, updates and validates", async () => {
    const f = {
      action: "saveFlat",
      create: true,
      flat: "999-1BHK",
      sl: 29,
      name: "New Viewer",
      type: "N-1BHK",
      bua: 800,
      uds: 250,
    };
    expect((await post(f)).body.ok).toBe(true);
    expect((await post(f)).code).toBe(400); // duplicate on create
    expect(
      (await post({ ...f, create: false, name: "Renamed", bua: 810.5 })).body
        .ok,
    ).toBe(true);
    const row = (await get()).body.flats.find((x) => x.flat === "999-1BHK");
    expect(row).toMatchObject({ name: "Renamed", bua: 810.5, sl: 29 });
    for (const bad of [
      { flat: "" },
      { flat: "bad;drop" },
      { bua: 0 },
      { bua: "" },
      { bua: -5 },
      { sl: 1.5 },
      { uds: -1 },
    ])
      expect((await post({ ...f, create: false, ...bad })).code).toBe(400);
  });

  it("removes a flat but keeps its payments; the built-in list is not re-seeded", async () => {
    await post({
      action: "savePayment",
      month: "2026-09",
      flat: "999-1BHK",
      maint: 60,
      corp: 400,
      mode: "UPI",
      date: "2026-09-02",
    });
    expect(
      (await post({ action: "deleteFlat", flat: "999-1BHK" })).body.ok,
    ).toBe(true);
    let body = (await get()).body;
    expect(body.flats.find((x) => x.flat === "999-1BHK")).toBeUndefined();
    expect(body.payments.some((p) => p.flat === "999-1BHK")).toBe(true);
    for (const f of body.flats)
      await post({ action: "deleteFlat", flat: f.flat });
    // simulate a cold start: fresh module state, same database
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = (await import("../api/app.js")).default;
    handler = fresh;
    body = (await get()).body;
    expect(body.flats).toEqual([]);
  });
});

describe("deleting a month keeps its Summary figures", () => {
  it("archives the snapshot, drops payments, and a re-created month starts fresh", async () => {
    // the figures are frozen on the server from the stored month and payments (never from the browser)
    // (an earlier test removed every flat, so add one back)
    await post({
      action: "saveFlat",
      create: true,
      flat: "101-3BHK",
      sl: 1,
      name: "",
      type: "N",
      bua: 1706.26,
      uds: 557.49,
    });
    await post({
      action: "savePayment",
      month: "2026-09",
      flat: "101-3BHK",
      maint: 100,
      corp: 50,
      mode: "UPI",
      date: "2026-09-02",
    });
    expect(
      (await post({ action: "deleteMonth", month: "2026-09" })).body.ok,
    ).toBe(true);
    let body = (await get()).body;
    expect(body.months.find((m) => m.month === "2026-09")).toBeUndefined();
    expect(body.payments.filter((p) => p.month === "2026-09")).toEqual([]);
    expect(body.archive).toHaveLength(1);
    expect(body.archive[0].data.paid["101-3BHK"]).toBe(100);
    expect(body.archive[0].data.cpaid["101-3BHK"]).toBe(50);
    expect((await post({ action: "deleteMonth", month: "2031-01" })).code).toBe(
      404,
    ); // no such month: nothing archived
    expect((await get()).body.archive).toHaveLength(1);
    await post({ action: "saveMonth", month: "2026-09", expenses: exp });
    expect((await get()).body.archive).toHaveLength(0);
  });
});
