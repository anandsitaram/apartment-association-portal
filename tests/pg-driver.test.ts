import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// The standard `pg` driver (used for Supabase) against real Postgres semantics: PGlite exposed over a socket.
const servers = [];
const url = (port: number) =>
  `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
async function startDb(port) {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();
  servers.push({ server, db });
}
const A = 54341,
  B = 54342,
  C = 54343;

beforeAll(async () => {
  await Promise.all([A, B, C].map(startDb));
  delete process.env.DB_DRIVER; // autodetect: a non-Neon host means the `pg` driver
  process.env.DATABASE_URL = url(A);
  process.env.ADMIN_PASSWORD = "pw";
  process.env.SEED_FLATS = "true";
  delete process.env.AUTH_ENABLED;
}, 60000);
afterAll(async () => {
  for (const { server, db } of servers) {
    await server.stop();
    await db.close();
  }
});

describe("driver selection", () => {
  it("uses neon for *.neon.tech and pg for everything else; strips sslmode", async () => {
    const { driver, cleanUrl, useSsl } = await import("../server/db.js");
    process.env.DATABASE_URL =
      "postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require";
    expect(driver()).toBe("neon");
    process.env.DATABASE_URL =
      "postgres://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
    expect(driver()).toBe("pg");
    process.env.DATABASE_URL = url(A);
    process.env.DB_DRIVER = "neon";
    expect(driver()).toBe("neon");
    delete process.env.DB_DRIVER;
    expect(cleanUrl("postgres://h/db?sslmode=require")).toBe("postgres://h/db");
    expect(cleanUrl("postgres://h/db?a=1&sslmode=require&b=2")).toBe(
      "postgres://h/db?a=1&b=2",
    );
    expect(cleanUrl("postgres://h/db?sslmode=require&supa=x")).toBe(
      "postgres://h/db?supa=x",
    );
    expect(
      useSsl("postgres://u:p@aws-0.pooler.supabase.com:6543/postgres"),
    ).toBe(true);
    expect(useSsl(url(A))).toBe(false); // local
  });
});

describe("app on the pg driver", () => {
  it("creates the schema with row-level security, and the API works end to end", async () => {
    const handler = (await import("../api/app.js")).default;
    const call = async (method: string, body?: any, token?: any) => {
      const out: { code?: number; body?: any } = {};
      const res = {
        setHeader() {},
        status(c: number) {
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
    };
    const token = (
      await call("POST", { action: "login", username: "admin", password: "pw" })
    ).body.token;
    expect(
      (
        await call(
          "POST",
          {
            action: "saveMonth",
            month: "2026-09",
            expenses: [{ description: "Bescom", amount: 1000 }],
            method: "divide",
            value: 25,
            rounding: "none",
            corpRate: 0.6,
          },
          token,
        )
      ).body.ok,
    ).toBe(true);
    expect(
      (
        await call(
          "POST",
          {
            action: "savePayment",
            month: "2026-09",
            flat: "101-3BHK",
            maint: 40,
            corp: 853,
            mode: "UPI",
            date: "2026-09-02",
            extra: { c1: "ok" },
          },
          token,
        )
      ).body.ok,
    ).toBe(true);
    const r = (await call("GET", undefined, token)).body;
    expect(r.months[0]).toMatchObject({
      month: "2026-09",
      corp_rate: 0.6,
      value: 25,
    });
    expect(r.payments[0]).toMatchObject({
      flat: "101-3BHK",
      maint: 40,
      corp: 853,
      extra: { c1: "ok" },
    });
    expect(r.flats).toHaveLength(28);

    const { sql, APP_TABLES } = await import("../server/db.js");
    const rows = await sql.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1)",
      [APP_TABLES],
    );
    expect(rows.map((x) => x.relname).sort()).toEqual([...APP_TABLES].sort());
    expect(rows.every((x) => x.relrowsecurity)).toBe(true);
  });
});

describe("db tool: backup / restore / copy", () => {
  const fixture = {
    app: "community-portal",
    version: 1,
    at: "2026-09-01T00:00:00Z",
    tables: {
      // an older backup: flats without the phone / email columns
      flats: [
        {
          flat: "1-A",
          sl: 1,
          name: "Old Viewer",
          type: "N",
          bua: 1000,
          uds: 300,
        },
      ],
      months: [
        {
          month: "2026-08",
          expenses: [{ description: "Bescom", amount: 900 }],
          divisor: 25,
          method: "divide",
          value: 25,
          rounding: "none",
          corp_rate: 0.5,
        },
      ],
      payments: [
        {
          month: "2026-08",
          flat: "1-A",
          maint: 36,
          corp: 500,
          mode: "UPI",
          paid_date: "2026-08-02",
          extra: {},
        },
      ],
      settings: [
        { key: "columns", value: { hidden: ["uds"], custom: [], labels: {} } },
      ],
      month_archive: [],
      users: [{ username: "boss", pass: "salt:hash", role: "super" }],
    },
  };
  it("restore creates the schema on an empty database and loads an older backup", async () => {
    const { restoreInto, backupFrom } = await import("../server/dbtool.js");
    await restoreInto(url(B), fixture);
    const back = await backupFrom(url(B), { users: true });
    expect(back.tables.flats).toEqual([
      {
        flat: "1-A",
        sl: 1,
        name: "Old Viewer",
        type: "N",
        bua: 1000,
        uds: 300,
        phone: "",
        email: "",
        excluded: false,
        corp_excluded: false, // column added later: an older backup gets its default
      },
    ]);
    expect(back.tables.months[0]).toMatchObject({
      month: "2026-08",
      corp_rate: 0.5,
    });
    expect(back.tables.payments[0]).toMatchObject({ flat: "1-A", maint: 36 });
    expect(back.tables.users).toEqual([
      {
        username: "boss",
        pass: "salt:hash",
        role: "super",
        flat: null,
        tok_ver: 0,
        phone: "",
        email: "",
      }, // column added later: defaults to 0
    ]);
    expect(back.tables.settings.some((s) => s.key === "schema_version")).toBe(
      false,
    );
    expect((await backupFrom(url(B))).tables.users).toBeUndefined(); // users only on request
  });
  it("restore is all-or-nothing", async () => {
    const { restoreInto, backupFrom } = await import("../server/dbtool.js");
    const broken = {
      ...fixture,
      tables: { ...fixture.tables, flats: [], payments: [{ nope: 1 }] },
    };
    await expect(restoreInto(url(B), broken)).rejects.toThrow();
    const back = await backupFrom(url(B));
    expect(back.tables.flats).toHaveLength(1); // the DELETE of flats was rolled back
    await expect(
      restoreInto(url(B), { app: "other", tables: {} } as any),
    ).rejects.toThrow(/not a valid Community Portal backup/);
  });
  it("copy moves everything, including user accounts, to another database", async () => {
    const { copyDb, backupFrom } = await import("../server/dbtool.js");
    const counts = await copyDb(url(B), url(C));
    expect(counts).toMatchObject({
      flats: 1,
      months: 1,
      payments: 1,
      users: 1,
    });
    const back = await backupFrom(url(C), { users: true });
    expect(back.tables.users[0].username).toBe("boss");
    expect(back.tables.flats[0].flat).toBe("1-A");
  });
});
