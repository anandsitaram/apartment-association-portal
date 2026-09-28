/**
 * Seed fictional demo flats, resident logins, and one sample month.
 * Intended only for a disposable local/demo database. Never run on production data.
 */
import { ensureSchema, sql } from "../server/db.js";
import { hash } from "../server/auth.js";
import flats from "../server/flats-seed.js";

const demoAccounts = [
  {
    username: "demo.admin",
    password: "DemoAdmin!2026",
    role: "admin",
    flat: null,
  },
  {
    username: "demo.alex",
    password: "ResidentDemo!2026",
    role: "user",
    flat: "A-101",
  },
  {
    username: "demo.jamie",
    password: "ResidentDemo!2026",
    role: "user",
    flat: "A-102",
  },
  {
    username: "demo.casey",
    password: "ResidentDemo!2026",
    role: "user",
    flat: "C-101",
  },
] as const;

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error(
      "Set DATABASE_URL (or POSTGRES_URL) to a disposable development database first.",
    );
  }
  if (/^(1|true|on|yes)$/i.test(process.env.SEED_FLATS || "")) {
    throw new Error(
      "Unset SEED_FLATS before running this script; this script seeds the full demo dataset itself.",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED_IN_PRODUCTION !== "true"
  ) {
    throw new Error(
      "Refusing to seed demo records in production. Use a separate demo database.",
    );
  }

  await ensureSchema();
  const existingFlats = await sql.query("SELECT flat FROM flats");
  const demoFlatIds = new Set(flats.map((f) => f.flat));
  const unexpectedFlats = existingFlats.filter(
    (f) => !demoFlatIds.has(String(f.flat)),
  );
  if (unexpectedFlats.length) {
    throw new Error(
      "The database contains non-demo flats. Use a fresh demo database; no changes were made.",
    );
  }

  const existingUsers = await sql.query("SELECT username FROM users");
  const demoUserIds = new Set(demoAccounts.map((u) => u.username));
  const unexpectedUsers = existingUsers.filter(
    (u) => !demoUserIds.has(String(u.username)),
  );
  if (unexpectedUsers.length) {
    throw new Error(
      "The database contains non-demo user accounts. Use a fresh demo database; no changes were made.",
    );
  }

  for (const f of flats) {
    await sql.query(
      `INSERT INTO flats(flat,sl,name,type,bua,uds,block) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(flat) DO NOTHING`,
      [f.flat, f.sl, f.name, f.type, f.bua, f.uds, f.block || ""],
    );
  }
  for (const user of demoAccounts) {
    await sql.query(
      `INSERT INTO users(username,pass,role,flat,phone,email) VALUES($1,$2,$3,$4,'','') ON CONFLICT(username) DO NOTHING`,
      [user.username, hash(user.password), user.role, user.flat],
    );
  }

  const month = "2026-09";
  const monthExists = await sql.query("SELECT 1 FROM months WHERE month=$1", [
    month,
  ]);
  if (!monthExists.length) {
    const expenses = [
      { description: "Security", amount: 50000 },
      { description: "Housekeeping", amount: 28000 },
      { description: "Utilities", amount: 26000 },
      { description: "Garden and common area", amount: 16000 },
    ];
    await sql.query(
      `INSERT INTO months(month,expenses,divisor,method,value,rounding,corp_rate,corp_rounding,notes) VALUES($1,$2::jsonb,$3,'divide',NULL,'nearest',0.5,'nearest','{}'::jsonb)`,
      [month, JSON.stringify(expenses), flats.length],
    );
    for (let i = 0; i < flats.length; i++) {
      const f = flats[i];
      const maint = i < 4 ? 10000 : i < 7 ? 5000 : 0;
      const corp =
        i < 4 ? Math.round(f.bua * 0.5) : i < 7 ? Math.round(f.bua * 0.25) : 0;
      await sql.query(
        `INSERT INTO payments(month,flat,maint,corp,mode,paid_date) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(month,flat) DO NOTHING`,
        [
          month,
          f.flat,
          maint,
          corp,
          maint || corp ? "Demo transfer" : "",
          maint || corp ? "2026-09-05" : "",
        ],
      );
    }
  }

  await sql.query(
    `INSERT INTO settings(key,value) VALUES('columns',jsonb_build_object('orgName','Cedar Grove Residences','orgShort','CG')) ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb) || jsonb_build_object('orgName',COALESCE(NULLIF(settings.value->>'orgName',''),'Cedar Grove Residences'),'orgShort',COALESCE(NULLIF(settings.value->>'orgShort',''),'CG'))`,
  );

  console.log("Demo data is ready.");
  console.log(
    "Super Admin: username super-admin, password = your ADMIN_PASSWORD environment variable",
  );
  for (const user of demoAccounts)
    console.log(`  ${user.username} / ${user.password} (${user.role})`);
  console.log(
    "These are fictional demo accounts. Do not deploy with these credentials enabled.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
