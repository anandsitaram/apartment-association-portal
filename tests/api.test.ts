import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "test";
process.env.SEED_FLATS = "true"; // these tests use the sample roster (server/flats-seed.js)
process.env.DB_DRIVER = "neon"; // the neon module is replaced by an in-memory Postgres (tests/neon-shim.js)
process.env.ADMIN_PASSWORD = "pw";

let handler: any, token: any, superToken: any;
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
  // The built-in "super-admin" login (ADMIN_PASSWORD) is the only account that
  // exists out of the box; every other account, including a plain "admin", has
  // to be created through saveUser first, same as a real deployment would.
  // (saveUser enforces a 6-character minimum, so the created account's
  // password can't just reuse the 2-character ADMIN_PASSWORD used above.)
  superToken = (
    await post(
      { action: "login", username: "super-admin", password: "pw" },
      null,
    )
  ).body.token;
  await post(
    {
      action: "saveUser",
      username: "admin",
      password: "adminpw1",
      role: "admin",
    },
    superToken,
  );
  token = (
    await post(
      { action: "login", username: "admin", password: "adminpw1" },
      null,
    )
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

  it("rejects anonymous dashboard reads before requiring a database connection", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const postgresUrl = process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    try {
      const response = await get(null);
      expect(response.code).toBe(401);
      expect(response.body).toMatchObject({
        error: "Login required",
        authRequired: true,
      });
    } finally {
      if (databaseUrl !== undefined) process.env.DATABASE_URL = databaseUrl;
      if (postgresUrl !== undefined) process.env.POSTGRES_URL = postgresUrl;
    }
  });
});

describe("visitor access security", () => {
  it("restricts code management to the linked owner and rejects expired approval/entry", async () => {
    const createdOwner = await post(
      {
        action: "saveUser",
        username: "visitor-owner",
        password: "ownerpw1",
        role: "user",
        flat: "A-101",
      },
      superToken,
    );
    expect(createdOwner.code).toBe(200);
    const createdSecurity = await post(
      {
        action: "saveUser",
        username: "gate-security",
        password: "securitypw1",
        role: "security",
      },
      superToken,
    );
    expect(createdSecurity.code).toBe(200);
    const ownerToken = (
      await post(
        { action: "login", username: "visitor-owner", password: "ownerpw1" },
        null,
      )
    ).body.token;
    const securityToken = (
      await post(
        { action: "login", username: "gate-security", password: "securitypw1" },
        null,
      )
    ).body.token;

    const adminCreate = await post(
      {
        action: "createSecurityCode",
        visitorName: "Admin should not create",
        flat: "A-101",
      },
      token,
    );
    expect(adminCreate.code).toBe(403);
    expect(
      (await post({ action: "listMySecurityCodes" }, token)).body.codes,
    ).toEqual([]);
    const otherFlatCreate = await post(
      {
        action: "createSecurityCode",
        visitorName: "Wrong flat",
        flat: "A-102",
      },
      ownerToken,
    );
    expect(otherFlatCreate.code).toBe(403);

    const { sql } = await import("../server/db.js");
    const first = await post(
      {
        action: "createSecurityCode",
        visitorName: "Expired before approval",
        flat: "A-101",
        purpose: "Visit",
      },
      ownerToken,
    );
    expect(first.code).toBe(200);
    const firstCode = first.body.code;
    expect(
      (await post({ action: "deleteMySecurityCode", id: firstCode.id }, token))
        .code,
    ).toBe(403);
    const firstLookup = await post(
      { action: "lookupSecurityCode", code: firstCode.code },
      securityToken,
    );
    expect(firstLookup.code).toBe(200);
    const firstRequest = await post(
      {
        action: "createVisitorPhotoRequest",
        accessCodeId: firstCode.id,
        photoData: "data:image/jpeg;base64,dGVzdA==",
      },
      securityToken,
    );
    expect(firstRequest.code).toBe(200);
    expect(
      (await post({ action: "listVisitorPhotoRequests" }, token)).body.requests,
    ).toEqual([]);
    await sql.query(
      "UPDATE security_access_codes SET expires_at=now() - interval '1 minute' WHERE id=$1",
      [firstCode.id],
    );
    const lateApproval = await post(
      {
        action: "reviewVisitorPhotoRequest",
        id: firstRequest.body.request.id,
        status: "approved",
      },
      ownerToken,
    );
    expect(lateApproval.code).toBe(409);

    const second = await post(
      {
        action: "createSecurityCode",
        visitorName: "Expired before gate",
        flat: "A-101",
        purpose: "Visit",
      },
      ownerToken,
    );
    expect(second.code).toBe(200);
    const secondCode = second.body.code;
    const secondRequest = await post(
      {
        action: "createVisitorPhotoRequest",
        accessCodeId: secondCode.id,
        photoData: "data:image/jpeg;base64,dGVzdA==",
      },
      securityToken,
    );
    expect(secondRequest.code).toBe(200);
    const approval = await post(
      {
        action: "reviewVisitorPhotoRequest",
        id: secondRequest.body.request.id,
        status: "approved",
      },
      ownerToken,
    );
    expect(approval.code).toBe(200);
    await sql.query(
      "UPDATE security_access_codes SET expires_at=now() - interval '1 minute' WHERE id=$1",
      [secondCode.id],
    );
    const lateEntry = await post(
      { action: "acceptSecurityCode", code: secondCode.code },
      securityToken,
    );
    expect(lateEntry.code).toBe(400);
  });
});

describe("months and Corp Fund rate", () => {
  it("persists optional block allocation metadata on expense lines", async () => {
    const monthKey = "2030-09";
    await post({
      action: "saveMonth",
      month: monthKey,
      create: true,
      expenses: [
        { description: "Shared security", amount: 5000 },
        {
          description: "Tower A lift",
          amount: 1200,
          allocationScope: "block",
          block: "Tower A",
        },
      ],
      method: "divide",
      value: 28,
      rounding: "none",
      corpApplicable: false,
    });
    const saved = (await get()).body.months.find(
      (m: any) => m.month === monthKey,
    );
    expect(saved.expenses).toMatchObject([
      {
        description: "Shared security",
        amount: 5000,
        allocationScope: "association",
        block: null,
      },
      {
        description: "Tower A lift",
        amount: 1200,
        allocationScope: "block",
        block: "Tower A",
      },
    ]);
  });

  it("persists the current expense total after explicit recalculation when the old basis is zero", async () => {
    const monthKey = "2030-10";
    await post({
      action: "saveMonth",
      month: monthKey,
      create: true,
      expenses: [{ description: "Old expense", amount: 0 }],
      method: "divide",
      value: 28,
      rounding: "up",
      corpApplicable: false,
      corpRate: 0.5,
      calculatedExpenseTotal: 0,
      notes: { expensesStage: "actual" },
    });

    await post({
      action: "saveMonth",
      month: monthKey,
      expenses: [
        { description: "Electricity", amount: 65000 },
        { description: "Security", amount: 15000 },
        { description: "Repairs", amount: 10000 },
      ],
      method: "divide",
      value: 28,
      rounding: "up",
      corpApplicable: false,
      calculatedExpenseTotal: 0,
      notes: { expensesStage: "actual" },
      recalculate: true,
    });

    const data = (await get()).body;
    const saved = data.months.find((m: any) => m.month === monthKey);
    expect(saved.calculated_expense_total).toBe(90000);
    expect(
      saved.expenses.reduce(
        (sum: number, expense: any) => sum + expense.amount,
        0,
      ),
    ).toBe(90000);
  });

  it("preserves carried-forward arrears when a month is recalculated", async () => {
    const sourceMonth = "2028-01";
    const nextMonth = "2028-02";
    await post({
      action: "saveMonth",
      month: sourceMonth,
      create: true,
      expenses: [{ description: "Maintenance basis", amount: 1000 }],
      method: "common",
      value: 100,
      rounding: "none",
      corpApplicable: true,
      corpMethod: "common",
      corpValue: 50,
      corpRate: 0.5,
      corpRounding: "none",
      notes: { expensesStage: "actual" },
    });
    await post({
      action: "saveMonth",
      month: nextMonth,
      create: true,
      expenses: [{ description: "Maintenance basis", amount: 2000 }],
      method: "common",
      value: 200,
      rounding: "none",
      corpApplicable: true,
      corpMethod: "common",
      corpValue: 60,
      corpRate: 0.5,
      corpRounding: "none",
      notes: { expensesStage: "actual" },
    });
    const completed = await post({
      action: "completeMonth",
      month: sourceMonth,
      combineCarryForward: false,
    });
    expect(completed.body.completed).toBe(true);

    await post({
      action: "saveMonth",
      month: nextMonth,
      expenses: [{ description: "Maintenance basis", amount: 2500 }],
      method: "common",
      value: 300,
      rounding: "none",
      corpApplicable: true,
      corpMethod: "common",
      corpValue: 70,
      corpRate: 0.5,
      corpRounding: "none",
      calculatedExpenseTotal: 2500,
      notes: {
        expensesStage: "actual",
        expenses: "Recalculated after carry-forward",
      },
      recalculate: true,
    });

    const data = (await get()).body;
    const target = data.months.find((m: any) => m.month === nextMonth);
    expect(target.notes.carryForward["A-101"]).toMatchObject({
      maintenance: 100,
      corp: 50,
      combined: false,
    });
  });

  it("defaults to 0.5, is kept by an expenses save, validated, copied to a new month", async () => {
    await post({
      action: "saveMonth",
      month: "2026-09",
      create: true,
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
      create: true,
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
    expect(admin.length).toBe(40);
    expect(admin[0]).toMatchObject({ flat: "A-101", name: "Alex Morgan" });
    // Any logged-in non-staff account (a plain "user") gets no owner names.
    // (There's no more anonymous/public view to check this against — login
    // is always required now — so use a real viewer account instead.)
    await post({
      action: "saveSettings",
      settings: { allowUsersViewAllFlats: true },
    });
    await post({
      action: "saveUser",
      username: "plainviewer",
      password: "viewerpw1",
      role: "user",
      flat: "A-101",
    });
    const viewerToken = (
      await post(
        { action: "login", username: "plainviewer", password: "viewerpw1" },
        null,
      )
    ).body.token;
    const viewer = (await get(viewerToken)).body.flats;
    expect(viewer.length).toBe(40);
    expect(viewer.every((f) => f.name === "")).toBe(true);

    // Carry-forward entries for other flats must remain private when the optional
    // all-flat financial visibility setting is disabled.
    await post({
      action: "saveSettings",
      settings: { allowUsersViewAllFlats: false },
    });
    await post({
      action: "saveMonth",
      month: "2041-01",
      create: true,
      expenses: [{ description: "Test", amount: 100 }],
      method: "divide",
      value: 28,
      notes: {
        carryForward: {
          "A-101": { maintenance: 900, corp: 250, combined: false },
          "A-102": { maintenance: 1500, corp: 500, combined: false },
        },
      },
    });
    const { sql } = await import("../server/db.js");
    await sql.query(
      `UPDATE months
       SET notes = notes || $2::jsonb
       WHERE month = $1`,
      [
        "2041-01",
        JSON.stringify({
          carryForward: {
            "A-101": { maintenance: 900, corp: 250, combined: false },
            "A-102": { maintenance: 1500, corp: 500, combined: false },
          },
        }),
      ],
    );
    const staffMonth = (await get()).body.months.find(
      (m: any) => m.month === "2041-01",
    );
    expect(Object.keys(staffMonth.notes.carryForward)).toHaveLength(2);
    const viewerMonth = (await get(viewerToken)).body.months.find(
      (m: any) => m.month === "2041-01",
    );
    expect(viewerMonth.notes.carryForward).toEqual({
      "A-101": { maintenance: 900, corp: 250, combined: false },
    });
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
      block: "Tower A",
    };
    expect((await post(f)).body.ok).toBe(true);
    expect((await post(f)).code).toBe(400); // duplicate on create
    expect(
      (await post({ ...f, create: false, name: "Renamed", bua: 810.5 })).body
        .ok,
    ).toBe(true);
    const row = (await get()).body.flats.find((x) => x.flat === "999-1BHK");
    expect(row).toMatchObject({
      name: "Renamed",
      bua: 810.5,
      sl: 29,
      block: "Tower A",
    });
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

  it("removes a flat and its payment history together (tracked in the audit detail)", async () => {
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
    // deleteFlat deliberately purges the flat's payment rows too (and audits
    // how many it removed) rather than leaving orphaned payment history.
    expect(body.payments.some((p) => p.flat === "999-1BHK")).toBe(false);
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
      flat: "A-101",
      sl: 1,
      name: "",
      type: "N",
      bua: 1706.26,
      uds: 557.49,
    });
    await post({
      action: "savePayment",
      month: "2026-09",
      flat: "A-101",
      maint: 100,
      corp: 50,
      mode: "UPI",
      date: "2026-09-02",
    });
    expect(
      (await post({ action: "deleteMonth", month: "2026-09" }, superToken)).body
        .deleted,
    ).toBe(true);
    let body = (await get()).body;
    expect(body.months.find((m) => m.month === "2026-09")).toBeUndefined();
    expect(body.payments.filter((p) => p.month === "2026-09")).toEqual([]);
    expect(body.archive).toHaveLength(1);
    expect(body.archive[0].data.paid["A-101"]).toBe(100);
    expect(body.archive[0].data.cpaid["A-101"]).toBe(50);
    expect(
      (await post({ action: "deleteMonth", month: "2099-11" }, superToken))
        .code,
    ).toBe(404); // no such month: nothing archived
    expect((await get()).body.archive).toHaveLength(1);
    await post({
      action: "saveMonth",
      month: "2026-09",
      create: true,
      expenses: exp,
    });
    expect((await get()).body.archive).toHaveLength(0);
  });
});

describe("parcel notices", () => {
  it("opens a notification by id for the owner and removes deleted parcels from lists", async () => {
    const suffix = Date.now();
    const ownerUsername = `parcel-owner-${suffix}`;
    const securityUsername = `parcel-security-${suffix}`;
    const ownerCreated = await post(
      {
        action: "saveUser",
        username: ownerUsername,
        password: "ownerpw1",
        role: "user",
        flat: "A-101",
      },
      superToken,
    );
    expect(ownerCreated.code).toBe(200);
    const securityCreated = await post(
      {
        action: "saveUser",
        username: securityUsername,
        password: "securitypw1",
        role: "security",
      },
      superToken,
    );
    expect(securityCreated.code).toBe(200);

    const ownerToken = (
      await post(
        { action: "login", username: ownerUsername, password: "ownerpw1" },
        null,
      )
    ).body.token;
    const securityToken = (
      await post(
        {
          action: "login",
          username: securityUsername,
          password: "securitypw1",
        },
        null,
      )
    ).body.token;

    const created = await post(
      {
        action: "createParcelNotice",
        flat: "A-101",
        courier: "Test Courier",
        trackingNumber: "TRACK-1",
        notes: "Test parcel",
        photoData: "data:image/jpeg;base64,dGVzdA==",
      },
      securityToken,
    );
    expect(created.code).toBe(200);
    const id = created.body.notice.id;

    const pending = await post(
      { action: "listPendingParcelNotifications" },
      ownerToken,
    );
    expect(pending.code).toBe(200);
    expect(pending.body.notices.some((notice: any) => notice.id === id)).toBe(
      true,
    );

    const direct = await post({ action: "getParcelNotice", id }, ownerToken);
    expect(direct.code).toBe(200);
    expect(direct.body.notice.id).toBe(id);
    expect(direct.body.notice.flat).toBe("A-101");

    const deleted = await post(
      { action: "deleteParcelNotice", id },
      ownerToken,
    );
    expect(deleted.code).toBe(200);

    const listAfterDelete = await post(
      { action: "listParcelNotices" },
      ownerToken,
    );
    expect(listAfterDelete.code).toBe(200);
    expect(
      listAfterDelete.body.notices.some((notice: any) => notice.id === id),
    ).toBe(false);

    const pendingAfterDelete = await post(
      { action: "listPendingParcelNotifications" },
      ownerToken,
    );
    expect(pendingAfterDelete.code).toBe(200);
    expect(
      pendingAfterDelete.body.notices.some((notice: any) => notice.id === id),
    ).toBe(false);

    const directAfterDelete = await post(
      { action: "getParcelNotice", id },
      ownerToken,
    );
    expect(directAfterDelete.code).toBe(404);
  });
});
