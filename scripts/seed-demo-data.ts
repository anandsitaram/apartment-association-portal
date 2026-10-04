/**
 * Seed fictional demo records across the web app's main modules for the last
 * three months (plus the current month-to-date). Intended only for a fresh,
 * disposable demo database. Never run this against production or real resident data.
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

const DEMO_TAG = "DEMO-AAP";
const demoPhoto =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzS8AAAAASUVORK5CYII=";
const iso = (date: Date) => date.toISOString();
const shiftMonth = (date: Date, offset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const monthDay = (date: Date, day: number) => {
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      Math.min(day, lastDay),
      10,
      0,
      0,
    ),
  );
};

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error(
      "Set DATABASE_URL (or POSTGRES_URL) to a disposable development database first.",
    );
  }
  if (/^(1|true|on|yes)$/i.test(process.env.SEED_FLATS || "")) {
    throw new Error(
      "Unset SEED_FLATS before running this script; it seeds the demo dataset itself.",
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
  const expectedFlats = new Set(flats.map((f) => f.flat));
  const existingFlats = await sql.query("SELECT flat FROM flats");
  if (existingFlats.some((f) => !expectedFlats.has(String(f.flat)))) {
    throw new Error(
      "The database contains non-demo flats. Use a fresh demo database; no changes were made.",
    );
  }
  const expectedUsers = new Set<string>(demoAccounts.map((u) => u.username));
  const existingUsers = await sql.query("SELECT username FROM users");
  if (existingUsers.some((u) => !expectedUsers.has(String(u.username)))) {
    throw new Error(
      "The database contains non-demo user accounts. Use a fresh demo database; no changes were made.",
    );
  }

  for (const f of flats) {
    await sql.query(
      `INSERT INTO flats(flat,sl,name,type,bua,uds) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(flat) DO NOTHING`,
      [f.flat, f.sl, f.name, f.type, f.bua, f.uds],
    );
  }
  for (const user of demoAccounts) {
    await sql.query(
      `INSERT INTO users(username,pass,role,flat,phone,email) VALUES($1,$2,$3,$4,'','') ON CONFLICT(username) DO NOTHING`,
      [user.username, hash(user.password), user.role, user.flat],
    );
  }

  const now = new Date();
  // Current month-to-date plus the previous three calendar months, covering a rolling 3-month window.
  const months = [3, 2, 1, 0].map((offset) => shiftMonth(now, -offset));
  const demoFlats = [
    "A-101",
    "A-102",
    "A-103",
    "A-104",
    "C-101",
    "C-102",
    "C-103",
    "C-104",
  ];
  const ownerForFlat = (flat: string) =>
    flat === "A-101"
      ? "demo.alex"
      : flat === "A-102"
        ? "demo.jamie"
        : flat === "C-101"
          ? "demo.casey"
          : "demo.admin";
  const expenseNames = [
    "Security services",
    "Housekeeping",
    "Electricity and water",
    "Lift maintenance",
    "Garden and common areas",
  ];

  // Monthly maintenance, expenses, and payment statuses. Each record is fictional and tagged.
  for (let mi = 0; mi < months.length; mi++) {
    const m = months[mi];
    const key = monthKey(m);
    const expenses = expenseNames.map((description, ei) => ({
      description: `${DEMO_TAG} ${description}`,
      amount: [
        50000,
        28000,
        22000 + mi * 1500,
        9000 + mi * 500,
        6500 + mi * 250,
      ][ei],
    }));
    await sql.query(
      `INSERT INTO months(month,expenses,divisor,method,rounding,corp_rate,corp_rounding,corp_method,corp_applicable,notes)
       VALUES($1,$2::jsonb,$3,'divide','nearest',0.5,'nearest','sqft',true,$4::jsonb)
       ON CONFLICT(month) DO NOTHING`,
      [
        key,
        JSON.stringify(expenses),
        flats.length,
        JSON.stringify({
          demoData: true,
          warning: "Fictional demo data; not real financial records",
        }),
      ],
    );
    for (let i = 0; i < flats.length; i++) {
      const f = flats[i];
      const pattern = (i + mi) % 5;
      const isPaid = pattern === 0 || pattern === 1 || pattern === 4;
      const isPartial = pattern === 2;
      const monthlyMaintenance = f.type === "3BHK" ? 4200 : 3200;
      const monthlyCorp = Math.round(f.bua * 0.5);
      const maint = isPaid
        ? monthlyMaintenance
        : isPartial
          ? Math.round(monthlyMaintenance / 2)
          : 0;
      const corp = isPaid
        ? monthlyCorp
        : isPartial
          ? Math.round(monthlyCorp / 2)
          : 0;
      const day = Math.min(
        5 + ((i * 3 + mi * 4) % 22),
        mi === 3 ? Math.max(1, now.getUTCDate()) : 28,
      );
      const paidDate = maint || corp ? iso(monthDay(m, day)).slice(0, 10) : "";
      const mode =
        maint || corp ? ["UPI", "Bank", "Cash", "Cheque"][i % 4] : "";
      const reference = `${DEMO_TAG}-${key.replace("-", "")}-${f.flat.replace("-", "")}`;
      const extra = {
        demoData: true,
        reference,
        note: "Fictional demo payment; not a real transaction",
        paymentStatus: isPaid ? "paid" : isPartial ? "partial" : "unpaid",
      };
      await sql.query(
        `INSERT INTO payments(month,flat,maint,corp,mode,paid_date,extra) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(month,flat) DO NOTHING`,
        [key, f.flat, maint, corp, mode, paidDate, JSON.stringify(extra)],
      );
    }
    await sql.query(
      `INSERT INTO corpus_ledger(at,month,kind,source,description,amount)
       SELECT $1,$2,'deposit','manual',$3,$4 WHERE NOT EXISTS (SELECT 1 FROM corpus_ledger WHERE description=$3)`,
      [
        iso(
          monthDay(
            m,
            Math.min(12, mi === 3 ? Math.max(1, now.getUTCDate()) : 12),
          ),
        ),
        key,
        `${DEMO_TAG} corpus contribution ${key}`,
        25000 + mi * 1500,
      ],
    );
    await sql.query(
      `INSERT INTO corpus_ledger(at,month,kind,source,description,amount)
       SELECT $1,$2,'withdrawal','manual',$3,$4 WHERE NOT EXISTS (SELECT 1 FROM corpus_ledger WHERE description=$3)`,
      [
        iso(
          monthDay(
            m,
            Math.min(22, mi === 3 ? Math.max(1, now.getUTCDate()) : 22),
          ),
        ),
        key,
        `${DEMO_TAG} common-area repair ${key}`,
        4500 + mi * 300,
      ],
    );
  }

  // Requests and complaints across all main resident-facing modules. DEMO_TAG makes reruns safe.
  const ticketSamples = [
    {
      category: "maintenance",
      title: "Water seepage near staircase",
      status: "open",
      days: 4,
    },
    {
      category: "maintenance",
      title: "Lift service follow-up",
      status: "in_progress",
      days: 18,
    },
    {
      category: "delivery",
      title: "Parcel handover confirmation",
      status: "resolved",
      days: 35,
    },
    {
      category: "security",
      title: "Visitor entry verification",
      status: "approved",
      days: 55,
    },
    {
      category: "maintenance",
      title: "Common corridor light replacement",
      status: "resolved",
      days: 72,
    },
  ] as const;
  for (let i = 0; i < ticketSamples.length; i++) {
    const t = ticketSamples[i];
    const marker = `${DEMO_TAG}-TICKET-${i + 1}`;
    const created = new Date(now.getTime() - t.days * 86400000);
    await sql.query(
      `INSERT INTO tickets(category,title,description,flat,status,created_by,created_at,updated_at,decided_by,decided_at,note)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE title=$2)`,
      [
        t.category,
        `${marker} ${t.title}`,
        `${DEMO_TAG}: fictional test case; no real service request.`,
        demoFlats[i],
        t.status,
        ownerForFlat(demoFlats[i]),
        iso(created),
        iso(new Date(created.getTime() + 3600000)),
        t.status === "open" || t.status === "in_progress" ? null : "demo.admin",
        t.status === "open" || t.status === "in_progress"
          ? null
          : iso(new Date(created.getTime() + 3600000)),
        "Demo record only",
      ],
    );
  }

  const bookingSamples = [
    {
      flat: "A-101",
      title: `${DEMO_TAG} Family gathering`,
      days: 65,
      status: "approved",
      amount: 1500,
    },
    {
      flat: "A-102",
      title: `${DEMO_TAG} Birthday event`,
      days: 28,
      status: "pending",
      amount: 1500,
    },
    {
      flat: "C-101",
      title: `${DEMO_TAG} Community meeting`,
      days: 8,
      status: "cancelled",
      amount: 0,
    },
  ] as const;
  for (const b of bookingSamples) {
    const starts = new Date(now.getTime() + b.days * 86400000);
    await sql.query(
      `INSERT INTO hall_bookings(flat,title,starts_at,ends_at,status,created_by,created_at,decided_by,decided_at,note,booking_amount)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 WHERE NOT EXISTS (SELECT 1 FROM hall_bookings WHERE title=$2)`,
      [
        b.flat,
        b.title,
        iso(starts),
        iso(new Date(starts.getTime() + 2 * 3600000)),
        b.status,
        ownerForFlat(b.flat),
        iso(new Date(now.getTime() - 20 * 86400000)),
        b.status === "pending" ? null : "demo.admin",
        b.status === "pending"
          ? null
          : iso(new Date(now.getTime() - 19 * 86400000)),
        "Fictional demo booking",
        b.amount,
      ],
    );
  }
  const gymSamples = [
    {
      flat: "A-101",
      title: `${DEMO_TAG} Morning gym slot`,
      days: 2,
      status: "approved",
    },
    {
      flat: "A-102",
      title: `${DEMO_TAG} Weekend gym slot`,
      days: 12,
      status: "pending",
    },
    {
      flat: "C-101",
      title: `${DEMO_TAG} Fitness session`,
      days: 32,
      status: "cancelled",
    },
  ] as const;
  for (const b of gymSamples) {
    const starts = new Date(now.getTime() + b.days * 86400000);
    await sql.query(
      `INSERT INTO gym_bookings(flat,title,starts_at,ends_at,status,created_by,created_at,decided_by,decided_at,note)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 WHERE NOT EXISTS (SELECT 1 FROM gym_bookings WHERE title=$2)`,
      [
        b.flat,
        b.title,
        iso(starts),
        iso(new Date(starts.getTime() + 3600000)),
        b.status,
        ownerForFlat(b.flat),
        iso(new Date(now.getTime() - 10 * 86400000)),
        b.status === "pending" ? null : "demo.admin",
        b.status === "pending"
          ? null
          : iso(new Date(now.getTime() - 9 * 86400000)),
        "Fictional demo booking",
      ],
    );
  }

  const pollTitle = `${DEMO_TAG} Common-area improvement poll`;
  const pollRows = await sql.query(
    `INSERT INTO polls(title,description,options,status,created_by,created_at,closes_at)
     SELECT $1,$2,$3::jsonb,'closed','demo.admin',$4,$5
     WHERE NOT EXISTS (SELECT 1 FROM polls WHERE title=$1) RETURNING id`,
    [
      pollTitle,
      "Fictional demo poll for testing voting and results.",
      JSON.stringify([
        "Add more seating",
        "Improve garden",
        "Upgrade lighting",
      ]),
      iso(new Date(now.getTime() - 60 * 86400000)),
      iso(new Date(now.getTime() - 30 * 86400000)),
    ],
  );
  let pollId = pollRows[0]?.id;
  if (!pollId) {
    const existingPoll = await sql.query(
      "SELECT id FROM polls WHERE title=$1 LIMIT 1",
      [pollTitle],
    );
    pollId = existingPoll[0]?.id;
  }
  if (pollId) {
    for (let i = 0; i < 6; i++) {
      await sql.query(
        `INSERT INTO poll_votes(poll_id,flat,option_index,at) VALUES($1,$2,$3,$4) ON CONFLICT(poll_id,flat) DO NOTHING`,
        [
          pollId,
          demoFlats[i],
          i % 3,
          iso(new Date(now.getTime() - (45 - i) * 86400000)),
        ],
      );
    }
  }

  const eventSamples = [
    {
      title: `${DEMO_TAG} Independence Day community gathering`,
      days: -50,
      duration: 3,
    },
    {
      title: `${DEMO_TAG} Residents association meeting`,
      days: -20,
      duration: 2,
    },
    { title: `${DEMO_TAG} Community clean-up day`, days: 10, duration: 3 },
  ] as const;
  for (const e of eventSamples) {
    const starts = new Date(now.getTime() + e.days * 86400000);
    await sql.query(
      `INSERT INTO events(title,description,location,starts_at,ends_at,created_by,created_at)
       SELECT $1,$2,$3,$4,$5,'demo.admin',$6 WHERE NOT EXISTS (SELECT 1 FROM events WHERE title=$1)`,
      [
        e.title,
        `${DEMO_TAG}: fictional community event`,
        "Community hall",
        iso(starts),
        iso(new Date(starts.getTime() + e.duration * 3600000)),
        iso(new Date(starts.getTime() - 15 * 86400000)),
      ],
    );
  }

  const accessSamples = [
    {
      code: "DEMO-AAP-ACCESS-101",
      flat: "A-101",
      name: "Demo Visitor One",
      status: "approved",
      days: 1,
    },
    {
      code: "DEMO-AAP-ACCESS-102",
      flat: "A-102",
      name: "Demo Delivery Visitor",
      status: "pending",
      days: 2,
    },
    {
      code: "DEMO-AAP-ACCESS-103",
      flat: "C-101",
      name: "Demo Expired Visitor",
      status: "rejected",
      days: -2,
    },
  ] as const;
  const accessIds: number[] = [];
  for (const a of accessSamples) {
    await sql.query(
      `INSERT INTO security_access_codes(code,visitor_name,flat,phone,purpose,status,created_by,created_at,expires_at,accepted_by,accepted_at,visit_at)
       VALUES($1,$2,$3,'0000000000','DEMO visit',$4,$5,$6,$7,$8,$9,$6) ON CONFLICT(code) DO NOTHING`,
      [
        a.code,
        a.name,
        a.flat,
        a.status,
        ownerForFlat(a.flat),
        iso(new Date(now.getTime() - 2 * 86400000)),
        iso(new Date(now.getTime() + a.days * 86400000)),
        a.status === "approved" ? "demo.admin" : null,
        a.status === "approved"
          ? iso(new Date(now.getTime() - 86400000))
          : null,
      ],
    );
    const rows = await sql.query(
      "SELECT id FROM security_access_codes WHERE code=$1",
      [a.code],
    );
    if (rows[0]?.id) accessIds.push(Number(rows[0].id));
  }
  const photoSamples = [
    {
      marker: `${DEMO_TAG}-PHOTO-1`,
      flat: "A-101",
      name: "Demo Visitor One",
      status: "pending",
      codeId: accessIds[0] ?? null,
    },
    {
      marker: `${DEMO_TAG}-PHOTO-2`,
      flat: "A-102",
      name: "Demo Visitor Two",
      status: "approved",
      codeId: accessIds[1] ?? null,
    },
    {
      marker: `${DEMO_TAG}-PHOTO-3`,
      flat: "C-101",
      name: "Demo Visitor Three",
      status: "rejected",
      codeId: null,
    },
  ] as const;
  for (const p of photoSamples) {
    // The image is a tiny generic placeholder, not a person's photograph.
    await sql.query(
      `INSERT INTO visitor_photo_requests(tenant_id,access_code_id,visitor_name,flat,purpose,phone,photo_data,status,created_by,created_at,reviewed_by,reviewed_at,review_note)
       SELECT 'default',$1,$2,$3,'DEMO photo request','0000000000',$4,$5,$6,$7,$8,$9,$10
       WHERE NOT EXISTS (SELECT 1 FROM visitor_photo_requests WHERE created_by=$6 AND review_note=$11)`,
      [
        p.codeId,
        p.name,
        p.flat,
        demoPhoto,
        p.status,
        ownerForFlat(p.flat),
        iso(new Date(now.getTime() - 14 * 86400000)),
        p.status === "pending" ? null : "demo.admin",
        p.status === "pending"
          ? null
          : iso(new Date(now.getTime() - 13 * 86400000)),
        p.marker,
        p.marker,
      ],
    );
  }
  const parcelSamples = [
    {
      flat: "A-101",
      courier: "Demo Courier A",
      tracking: `${DEMO_TAG}-PARCEL-101`,
      status: "pending",
      days: 1,
    },
    {
      flat: "A-102",
      courier: "Demo Courier B",
      tracking: `${DEMO_TAG}-PARCEL-102`,
      status: "collected",
      days: 15,
    },
    {
      flat: "C-101",
      courier: "Demo Courier C",
      tracking: `${DEMO_TAG}-PARCEL-103`,
      status: "pending",
      days: 42,
    },
  ] as const;
  for (const p of parcelSamples) {
    await sql.query(
      `INSERT INTO parcel_notices(tenant_id,flat,courier,tracking_number,notes,photo_data,status,created_by,created_at,acknowledged_by,acknowledged_at)
       SELECT 'default',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10 WHERE NOT EXISTS (SELECT 1 FROM parcel_notices WHERE tracking_number=$3)`,
      [
        p.flat,
        p.courier,
        p.tracking,
        `${DEMO_TAG}: fictional parcel notice`,
        demoPhoto,
        p.status,
        "demo.admin",
        iso(new Date(now.getTime() - p.days * 86400000)),
        p.status === "collected" ? ownerForFlat(p.flat) : null,
        p.status === "collected"
          ? iso(new Date(now.getTime() - (p.days - 1) * 86400000))
          : null,
      ],
    );
  }

  const contactSamples = [
    {
      name: "Demo Resident Alex",
      email: "alex@example.com",
      subject: `${DEMO_TAG} Maintenance question`,
      status: "pending",
      days: 3,
    },
    {
      name: "Demo Resident Jamie",
      email: "jamie@example.com",
      subject: `${DEMO_TAG} Hall booking query`,
      status: "resolved",
      days: 24,
    },
  ] as const;
  for (const c of contactSamples) {
    await sql.query(
      `INSERT INTO contact_submissions(name,email,subject,message,submitted_by,submitted_at,status,read_at,read_by)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE NOT EXISTS (SELECT 1 FROM contact_submissions WHERE subject=$3)`,
      [
        c.name,
        c.email,
        c.subject,
        `${DEMO_TAG}: fictional sample enquiry`,
        "demo.admin",
        iso(new Date(now.getTime() - c.days * 86400000)),
        c.status,
        c.status === "resolved"
          ? iso(new Date(now.getTime() - (c.days - 1) * 86400000))
          : null,
        c.status === "resolved" ? "demo.admin" : "",
      ],
    );
  }
  for (let i = 0; i < 5; i++) {
    const marker = `${DEMO_TAG}-NOTICE-${i + 1}`;
    await sql.query(
      `INSERT INTO notification_logs(sent_at,sent_by,channel,target,subject,message,status)
       SELECT $1,'demo.admin',$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM notification_logs WHERE subject=$4)`,
      [
        iso(new Date(now.getTime() - (i * 12 + 2) * 86400000)),
        i % 2 ? "in-app" : "email",
        demoFlats[i],
        marker,
        `${DEMO_TAG}: fictional reminder or parcel update`,
        i === 4 ? "failed" : "sent",
      ],
    );
    await sql.query(
      `INSERT INTO security_events(tenant_id,at,type,username,ip,detail)
       SELECT 'default',$1,$2,$3,'192.0.2.10',$4::jsonb WHERE NOT EXISTS (SELECT 1 FROM security_events WHERE detail->>'demoMarker'=$5)`,
      [
        iso(new Date(now.getTime() - (i * 9 + 1) * 86400000)),
        [
          "visitor_code_created",
          "visitor_approved",
          "parcel_received",
          "visitor_rejected",
          "gate_check",
        ][i],
        ownerForFlat(demoFlats[i]),
        JSON.stringify({
          demoData: true,
          demoMarker: marker,
          flat: demoFlats[i],
          note: "Fictional test event",
        }),
        marker,
      ],
    );
  }

  await sql.query(
    `INSERT INTO settings(key,value) VALUES('columns',jsonb_build_object('orgName','Kadamba Lake View Apartment','orgShort','KLV'))
     ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb) || jsonb_build_object(
       'orgName',COALESCE(NULLIF(settings.value->>'orgName',''),'Kadamba Lake View Apartment'),
       'orgShort',COALESCE(NULLIF(settings.value->>'orgShort',''),'KLV'))`,
  );

  console.log(
    `Demo records seeded for ${monthKey(months[0])} through ${monthKey(months[months.length - 1])}.`,
  );
  console.log(
    "Modules covered: flats/residents, monthly maintenance, payments, expenses, corpus ledger, tickets, hall/gym bookings, polls/votes, events, visitor access, visitor photo requests, parcel notices, notifications, contact submissions, and security events.",
  );
  console.log("Demo accounts (disposable demo database only):");
  for (const user of demoAccounts)
    console.log(`  ${user.username} / ${user.password} (${user.role})`);
  console.log(
    "Never deploy with these demo credentials or run this seed against production data.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
