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
  const demoUserIds = new Set<string>(demoAccounts.map((u) => u.username));
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

  // Fictional maintenance-payment records for the two most recent completed months.
  // This seed is for a disposable demo database only; every inserted payment carries
  // an explicit demo reference/note so it is not mistaken for a real transaction.
  const demoMonths = [
    {
      month: "2026-08",
      expenses: [
        { description: "Security", amount: 50000 },
        { description: "Housekeeping", amount: 28000 },
        { description: "Utilities", amount: 24500 },
        { description: "Garden and common area", amount: 14500 },
      ],
      paidDateBase: "2026-08",
    },
    {
      month: "2026-09",
      expenses: [
        { description: "Security", amount: 50000 },
        { description: "Housekeeping", amount: 28000 },
        { description: "Utilities", amount: 26000 },
        { description: "Garden and common area", amount: 16000 },
      ],
      paidDateBase: "2026-09",
    },
  ] as const;

  for (const demoMonth of demoMonths) {
    const monthExists = await sql.query("SELECT 1 FROM months WHERE month=$1", [
      demoMonth.month,
    ]);
    if (!monthExists.length) {
      await sql.query(
        `INSERT INTO months(month,expenses,divisor,method,value,rounding,corp_rate,corp_rounding,notes) VALUES($1,$2::jsonb,$3,'divide',NULL,'nearest',0.5,'nearest',$4::jsonb)`,
        [
          demoMonth.month,
          JSON.stringify(demoMonth.expenses),
          flats.length,
          JSON.stringify({ demoData: true, warning: "Fictional demo data; not real financial records" }),
        ],
      );
    }

    for (let i = 0; i < flats.length; i++) {
      const f = flats[i];
      // Keep a repeatable mix of paid, partial, and unpaid sample records.
      // 0, 1, and 4 in each five-flat group are paid; 2 is partial; 3 is unpaid.
      const paymentPattern = i % 5;
      const isPaid = paymentPattern === 0 || paymentPattern === 1 || paymentPattern === 4;
      const isPartial = paymentPattern === 2;
      const monthlyMaintenance = f.type === "3BHK" ? 4200 : 3200;
      const monthlyCorp = Math.round(f.bua * 0.5);
      const maint = isPaid
        ? monthlyMaintenance
        : isPartial
          ? Math.round(monthlyMaintenance * 0.5)
          : 0;
      const corp = isPaid
        ? monthlyCorp
        : isPartial
          ? Math.round(monthlyCorp * 0.5)
          : 0;
      const day = String(3 + ((i * 3 + (demoMonth.month === "2026-08" ? 1 : 2)) % 25)).padStart(2, "0");
      const paidDate = maint || corp ? `${demoMonth.paidDateBase}-${day}` : "";
      const mode = !(maint || corp)
        ? ""
        : ["UPI", "Bank", "Cash", "Cheque"][i % 4];
      const reference = `DEMO-${demoMonth.month.replace("-", "")}-${f.flat.replace("-", "")}`;
      const extra = {
        demoData: "true",
        reference,
        note: "Fictional demo payment; not a real transaction",
        paymentStatus: isPaid ? "paid" : isPartial ? "partial" : "unpaid",
      };
      await sql.query(
        `INSERT INTO payments(month,flat,maint,corp,mode,paid_date,extra) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(month,flat) DO NOTHING`,
        [demoMonth.month, f.flat, maint, corp, mode, paidDate, JSON.stringify(extra)],
      );
    }
  }

  await sql.query(
    `INSERT INTO settings(key,value) VALUES('columns',jsonb_build_object('orgName','Kadamba Lake View Apartment','orgShort','KLV')) ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb) || jsonb_build_object('orgName',COALESCE(NULLIF(settings.value->>'orgName',''),'Kadamba Lake View Apartment'),'orgShort',COALESCE(NULLIF(settings.value->>'orgShort',''),'KLV'))`,
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
