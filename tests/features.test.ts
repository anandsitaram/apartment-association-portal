import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "test";
process.env.SEED_FLATS = "true"; // these tests use the sample roster (server/flats-seed.js)
process.env.DB_DRIVER = "neon"; // replaced by an in-memory Postgres (tests/neon-shim.js)
process.env.ADMIN_PASSWORD = "adminpw1";

const FLAGS = [
  "OWNER_VIEW",
  "AUDIT_LOG",
  "LOGIN_RATE_LIMIT",
  "REMINDERS",
  "AUTO_BACKUP",
];
let handler: any, runDaily: any, admin: any;

async function call(
  method: string,
  body?: any,
  { token, ip }: { token?: any; ip?: string } = {},
) {
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
      headers: {
        ...(token && { authorization: "Bearer " + token }),
        ...(ip && { "x-forwarded-for": ip }),
      },
    },
    res,
  );
  return out;
}
const post = (body?: any, token: any = admin, ip?: string) =>
  call("POST", body, { token, ip });
const get = (token?: any) => call("GET", undefined, { token });
const login = async (username: string, password: string, ip?: string) =>
  await call("POST", { action: "login", username, password }, { ip });
const exp = [{ description: "Bescom", amount: 1000 }];

beforeAll(async () => {
  handler = (await import("../api/app.js")).default;
  ({ runDaily } = await import("../server/jobs.js"));
  // Only "super-admin" exists out of the box (via ADMIN_PASSWORD); create the
  // "admin" account these tests run as, the same way a real deployment would.
  const superToken = (await login("super-admin", "adminpw1")).body.token;
  await call(
    "POST",
    {
      action: "saveUser",
      username: "admin",
      password: "adminpw1",
      role: "admin",
    },
    { token: superToken },
  );
  admin = (await login("admin", "adminpw1")).body.token;
});
afterEach(() => {
  for (const f of FLAGS) delete process.env[f];
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.BACKUP_EMAIL;
  vi.unstubAllGlobals();
});

describe("input validation", () => {
  it("rejects malformed months, expenses, payments", async () => {
    const ok = { action: "saveMonth", month: "2026-09", expenses: exp };
    expect((await post(ok)).body.ok).toBe(true);
    for (const bad of [
      { month: "2026-13" },
      { month: "Sept" },
      { month: "" },
      { month: undefined },
      { expenses: "nope" },
      { expenses: [{ description: "x", amount: "abc" }] },
      {
        expenses: [{ description: "x", amount: 1, allocationScope: "unknown" }],
      },
      { expenses: [{ description: "x", amount: 1, allocationScope: "block" }] },
      { expenses: Array(31).fill({ description: "x", amount: 1 }) },
      { method: "magic" },
      { rounding: "sideways" },
      { value: -5 },
      { value: "x" },
    ])
      expect(
        (await post({ ...ok, ...bad })).code,
        JSON.stringify(bad).slice(0, 40),
      ).toBe(400);
    const pay = {
      action: "savePayment",
      month: "2026-09",
      flat: "101-3BHK",
      maint: 10,
      corp: 5,
      mode: "UPI",
      date: "2026-09-02",
    };
    expect((await post(pay)).body.ok).toBe(true);
    for (const bad of [
      { mode: "Barter" },
      { date: "yesterday" },
      { maint: "abc" },
      { flat: "" },
      { month: "x" },
    ])
      expect((await post({ ...pay, ...bad })).code, JSON.stringify(bad)).toBe(
        400,
      );
    expect((await post({ action: "clearPayments", month: "bad" })).code).toBe(
      400,
    );
    expect((await post({ action: "deleteMonth", month: "bad" })).code).toBe(
      400,
    );
  });
});

describe("login required", () => {
  it("GET always requires login; there is no public/anonymous view", async () => {
    expect((await get()).code).toBe(401);
    expect(
      (await post({ action: "saveCorpRate", month: "2026-09", rate: 1 }, null))
        .code,
    ).toBe(401); // edits always needed a login too
    const r = await get(admin);
    expect(r.code).toBe(200);
    expect(r.body.features).toMatchObject({ auth: true });
    expect(r.body.features).not.toHaveProperty("publicView");
  });
});

describe("login rate limit", () => {
  it("locks a user+IP after 5 wrong passwords; other IPs and the right user are unaffected", async () => {
    process.env.LOGIN_RATE_LIMIT = "true";
    for (let i = 0; i < 5; i++)
      expect((await login("admin", "wrong", "9.9.9.9")).code).toBe(401);
    const locked = await login("admin", "adminpw1", "9.9.9.9"); // even the right password is refused now
    expect(locked.code).toBe(429);
    expect(locked.body.error).toMatch(/Try again in \d+ minute/);
    expect((await login("admin", "adminpw1", "8.8.8.8")).code).toBe(200);
  });
  it("a good login clears the user+IP counter", async () => {
    process.env.LOGIN_RATE_LIMIT = "true";
    for (let i = 0; i < 3; i++) await login("admin", "wrong", "7.7.7.7");
    expect((await login("admin", "adminpw1", "7.7.7.7")).code).toBe(200);
    for (let i = 0; i < 4; i++)
      expect((await login("admin", "wrong", "7.7.7.7")).code).toBe(401);
  });
  it("locks an IP after 20 wrong attempts across usernames", async () => {
    process.env.LOGIN_RATE_LIMIT = "true";
    for (let i = 0; i < 20; i++) await login("user" + i, "wrong", "6.6.6.6");
    expect((await login("admin", "adminpw1", "6.6.6.6")).code).toBe(429);
  });
  it("does nothing while the flag is off (on by default otherwise)", async () => {
    process.env.LOGIN_RATE_LIMIT = "false";
    for (let i = 0; i < 8; i++) await login("admin", "wrong", "5.5.5.5");
    expect((await login("admin", "adminpw1", "5.5.5.5")).code).toBe(200);
    process.env.LOGIN_RATE_LIMIT = "true";
  });
});

describe("audit log", () => {
  it("records nothing while off, then who changed what once on (super admin only), on by default otherwise", async () => {
    process.env.AUDIT_LOG = "false";
    const pay = {
      action: "savePayment",
      month: "2026-09",
      flat: "102-2BHK",
      maint: 60,
      corp: 400,
      mode: "UPI",
      date: "2026-09-03",
    };
    await post(pay);
    const before = (await post({ action: "listAudit" })).body.entries.length; // earlier tests may have logged, with the default-on flag
    process.env.AUDIT_LOG = "true";
    await post({ ...pay, maint: 75 });
    await post({ action: "saveCorpRate", month: "2026-09", rate: 0.6 });
    const { entries } = (await post({ action: "listAudit" })).body;
    expect(entries).toHaveLength(before + 2); // the payment made while AUDIT_LOG was off left no trace
    expect(entries.slice(0, 2).map((e) => e.action)).toEqual([
      "saveCorpRate",
      "savePayment",
    ]); // newest first
    expect(entries[1]).toMatchObject({
      username: "super-admin",
      target: "2026-09 102-2BHK",
    });
    expect(entries[1].detail.changes).toEqual({ maint: [60, 75] });
    expect(entries[0].detail).toEqual({ corpRate: 0.6 });
    process.env.AUDIT_LOG = "false"; // restore for tests earlier in file order that assume it off (module reset per file, but harmless)
  });
  it("only super admins can read it", async () => {
    await post({
      action: "saveUser",
      username: "helper",
      password: "helper123",
      role: "admin",
    });
    const t = (await login("helper", "helper123")).body.token;
    expect((await post({ action: "listAudit" }, t)).code).toBe(403);
  });
});

describe("flat contact details", () => {
  it("are stored, validated, kept when not sent, and only sent to admins", async () => {
    const f = {
      action: "saveFlat",
      create: true,
      flat: "555-1BHK",
      sl: 50,
      name: "Contact Viewer",
      type: "N",
      bua: 900,
      uds: 300,
      phone: "+91 98450 12345",
      email: "owner@example.com",
    };
    expect((await post(f)).body.ok).toBe(true);
    expect(
      (await post({ ...f, create: false, email: "not-an-email" })).code,
    ).toBe(400);
    expect((await post({ ...f, create: false, phone: "abc" })).code).toBe(400);
    const { phone, email, ...noContact } = f;
    await post({ ...noContact, create: false, name: "Renamed" }); // phone/email not sent -> kept
    const row = (await get(admin)).body.flats.find(
      (x) => x.flat === "555-1BHK",
    );
    expect(row).toMatchObject({ name: "Renamed", phone, email });
    // A logged-in but non-staff account never receives contact details.
    await post({
      action: "saveUser",
      username: "contactviewer",
      password: "viewer1234",
      role: "user",
    });
    const viewerToken = (await login("contactviewer", "viewer1234")).body.token;
    const asViewer = (await get(viewerToken)).body.flats.find(
      (x) => x.flat === "555-1BHK",
    );
    expect(asViewer).not.toHaveProperty("phone");
    expect(asViewer).not.toHaveProperty("email");
  });
});

describe("security", () => {
  it("changing a password signs that user out everywhere: an old token stops working immediately", async () => {
    await post({
      action: "saveUser",
      username: "sec1",
      password: "firstpw12",
      role: "user",
    });
    const oldToken = (await login("sec1", "firstpw12")).body.token;
    expect((await get(oldToken)).body.me?.name).toBe("sec1");
    await post({
      action: "saveUser",
      username: "sec1",
      password: "secondpw34",
      role: "user",
    });
    expect((await get(oldToken)).code).toBe(401); // the token issued before the change no longer works
    const newToken = (await login("sec1", "secondpw34")).body.token;
    expect((await get(newToken)).body.me?.name).toBe("sec1");
  });
  it("a non-password edit (role, flat) does not sign the user out", async () => {
    await post({
      action: "saveUser",
      username: "sec2",
      password: "firstpw12",
      role: "user",
    });
    const t = (await login("sec2", "firstpw12")).body.token;
    await post({ action: "saveUser", username: "sec2", role: "admin" }); // no password sent
    expect((await get(t)).body.me?.name).toBe("sec2");
  });
  it("deleting a user invalidates their token immediately, even mid-expiry", async () => {
    await post({
      action: "saveUser",
      username: "sec3",
      password: "firstpw12",
      role: "user",
    });
    const t = (await login("sec3", "firstpw12")).body.token;
    await post({ action: "deleteUser", username: "sec3" });
    expect((await get(t)).code).toBe(401);
  });
  it("Super Admin can restrict Admin accounts from deleting users", async () => {
    await post({
      action: "saveUser",
      username: "delete-admin",
      password: "deletepw1",
      role: "admin",
    });
    await post({
      action: "saveUser",
      username: "delete-target",
      password: "deletepw1",
      role: "user",
    });
    await post({
      action: "saveSettings",
      settings: { allowAdminUserDeletion: false },
    });

    const adminToken = (await login("delete-admin", "deletepw1")).body.token;
    expect(
      (
        await post(
          { action: "deleteUser", username: "delete-target" },
          adminToken,
        )
      ).code,
    ).toBe(403);

    await post({
      action: "saveSettings",
      settings: { allowAdminUserDeletion: true },
    });
    expect(
      (
        await post(
          { action: "deleteUser", username: "delete-target" },
          adminToken,
        )
      ).body.ok,
    ).toBe(true);
  });
});

describe("viewer view", () => {
  it("a viewer sees only their own flat (and name), payments and archived figures", async () => {
    await post({
      action: "saveUser",
      username: "flat101",
      password: "viewer1234",
      role: "user",
      flat: "101-3BHK",
    });
    expect(
      (
        await post({
          action: "saveUser",
          username: "ghost",
          password: "viewer1234",
          role: "user",
          flat: "nope",
        })
      ).code,
    ).toBe(400);
    await post({
      action: "savePayment",
      month: "2026-09",
      flat: "101-3BHK",
      maint: 60,
      corp: 853,
      mode: "UPI",
      date: "2026-09-01",
    });
    // a deleted month is frozen into the archive (calculated on the server)
    await post({ action: "saveMonth", month: "2026-08", expenses: exp });
    await post({ action: "deleteMonth", month: "2026-08" });
    const t = (await login("flat101", "viewer1234")).body.token;

    // flag off: a viewer sees every flat but no names
    process.env.VIEWER_VIEW = "false";
    process.env.OWNER_VIEW = "false";
    let r = (await get(t)).body;
    expect(r.flats.length).toBeGreaterThan(20);
    expect(r.flats.every((f) => f.name === "")).toBe(true);
    expect(r.residentOnly).toBe(false);

    delete process.env.OWNER_VIEW;
    process.env.VIEWER_VIEW = "true";
    r = (await get(t)).body;
    expect(r.residentOnly).toBe(true);
    expect(r.mine).toBe("101-3BHK");
    expect(r.flats.map((f) => f.flat)).toEqual(["101-3BHK"]);
    expect(r.flats[0].name).toBe("Dr M V Reddy"); // their own name
    expect(r.flats[0]).not.toHaveProperty("phone");
    expect(r.payments.every((p) => p.flat === "101-3BHK")).toBe(true);
    expect(r.payments.length).toBeGreaterThan(0);
    expect(Object.keys(r.archive[0].data.due)).toEqual(["101-3BHK"]);
    // an admin is not restricted
    expect((await get(admin)).body.flats.length).toBeGreaterThan(20);
  });
  it("a viewer without a linked flat sees nothing", async () => {
    await post({
      action: "saveUser",
      username: "noflat",
      password: "viewer1234",
      role: "user",
    });
    process.env.OWNER_VIEW = "true";
    const t = (await login("noflat", "viewer1234")).body.token;
    const r = (await get(t)).body;
    expect(r.flats).toEqual([]);
    expect(r.payments).toEqual([]);
  });
});

describe("reminders by e-mail", () => {
  const items = [
    { flat: "555-1BHK", subject: "Maintenance reminder", text: "Please pay." },
    { flat: "101-3BHK", subject: "Maintenance reminder", text: "Please pay." },
  ];
  it("is refused while the flag is off or mail is not configured", async () => {
    expect((await post({ action: "sendReminders", items })).code).toBe(400);
    process.env.REMINDERS = "true";
    const r = await post({ action: "sendReminders", items });
    expect(r.code).toBe(400);
    expect(r.body.error).toMatch(/not configured/);
  });
  it("sends to flats that have an address and reports the rest", async () => {
    process.env.REMINDERS = "true";
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "RV Fallon <no-reply@example.com>";
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = (await post({ action: "sendReminders", items })).body;
    expect(r.sent).toBe(1);
    expect(r.skipped).toEqual([
      { flat: "101-3BHK", reason: "no e-mail address" },
    ]);
    const [url, opts] = fetchMock.mock.calls[0] as any[];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(opts.body)).toMatchObject({
      to: ["owner@example.com"],
      subject: "Maintenance reminder",
    });
    expect(opts.headers.Authorization).toBe("Bearer re_test");
  });
});

describe("backups", () => {
  it("super admin can download a backup (no password hashes)", async () => {
    const { backup } = (await post({ action: "backup" })).body;
    expect(backup.app).toBe("my-apartment");
    expect(Object.keys(backup.tables).sort()).toEqual([
      "corpus_ledger",
      "flats",
      "month_archive",
      "months",
      "payments",
      "settings",
    ]);
    expect(backup.tables.flats.length).toBeGreaterThan(20);
    expect(JSON.stringify(backup)).not.toMatch(/scrypt|pass/);
    expect(backup.tables.settings.some((s) => s.key === "schema_version")).toBe(
      false,
    );
  });
  it("daily job: always keeps the DB awake; backs up once a day when on; prunes; e-mails on Mondays", async () => {
    expect(await runDaily()).toEqual({
      keepAlive: true,
      backup: false,
      emailed: false,
    });
    process.env.AUTO_BACKUP = "true";
    process.env.BACKUP_KEEP = "2";
    const r1 = await runDaily(new Date("2026-09-22T03:00:00Z")); // a Tuesday
    expect(r1).toMatchObject({ backup: true, emailed: false });
    expect((await runDaily()).backup).toBe(false); // already done today
    const list = (await post({ action: "listBackups" })).body.backups;
    expect(list).toHaveLength(1);
    const got = (await post({ action: "getBackup", id: list[0].id })).body
      .backup;
    expect(got.tables.months.length).toBeGreaterThan(0);
    expect((await post({ action: "getBackup", id: 99999 })).code).toBe(404);
    delete process.env.BACKUP_KEEP;

    // Monday + mail configured -> attachment
    const { sql } = await import("../server/db.js");
    await sql.query("UPDATE backups SET at = at - interval '2 days'");
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "x@example.com";
    process.env.BACKUP_EMAIL = "treasurer@example.com";
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r2 = await runDaily(new Date("2026-09-21T03:00:00Z")); // a Monday
    expect(r2).toMatchObject({ backup: true, emailed: true });
    const sent = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(sent.to).toEqual(["treasurer@example.com"]);
    expect(sent.attachments[0].filename).toMatch(
      /^my-apartment-backup-2026-09-21\.json$/,
    );
    expect(
      JSON.parse(Buffer.from(sent.attachments[0].content, "base64").toString())
        .app,
    ).toBe("my-apartment");
    // pruning: only the newest BACKUP_KEEP (2) are kept
    expect((await post({ action: "listBackups" })).body.backups).toHaveLength(
      2,
    );
    process.env.BACKUP_KEEP = "2";
    await sql.query("UPDATE backups SET at = at - interval '2 days'");
    await runDaily(new Date("2026-09-22T03:00:00Z"));
    expect((await post({ action: "listBackups" })).body.backups).toHaveLength(
      2,
    );
    delete process.env.BACKUP_KEEP;
  });
});

describe("cold start", () => {
  it("skips the schema work when the version matches, and the built-in Super Admin login still works after every other account is gone", async () => {
    const { sql } = await import("../server/db.js");
    await sql.query("DELETE FROM users");
    vi.resetModules();
    const fresh = (await import("../api/app.js")).default;
    const { sql: freshSql } = await import("../server/db.js");
    const spy = vi.spyOn(freshSql, "query");
    handler = fresh;
    // No user rows exist any more, so only the built-in Super Admin
    // (ADMIN_PASSWORD, never stored in the users table) can still log in.
    const superToken = (await login("super-admin", "adminpw1")).body.token;
    expect(superToken).toBeTruthy();
    const ddl = spy.mock.calls.filter(([t]) => /^\s*(CREATE|ALTER)/i.test(t));
    expect(ddl).toEqual([]); // schema already at the current version: no DDL on a cold start
    // Re-create the "admin" account the rest of the file runs as.
    await call(
      "POST",
      {
        action: "saveUser",
        username: "admin",
        password: "adminpw1",
        role: "admin",
      },
      { token: superToken },
    );
    admin = (await login("admin", "adminpw1")).body.token;
  });
});
