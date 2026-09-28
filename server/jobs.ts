import { AUTO_BACKUP, MAIL } from "./flags.js";
import { APP_BRAND_NAME, APP_BRAND_SHORT } from "../shared/branding.js";
import { sql } from "./db.js";
import { dump } from "./backup.js";
import { sendMail } from "./mail.js";
import { ENABLE_NOTIFICATION } from "./flags.js";
import { sendNotification } from "./notifications.js";
import { snapshotOf } from "./calculations.js";

// Today's date in India (the cron runs in UTC)
const istToday = (now: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(now); // YYYY-MM-DD
  const [y, m, d] = p.split("-").map(Number) as [number, number, number];
  return { y, m, d, utc: Date.UTC(y, m - 1, d) };
};

// Poll closing tomorrow: nudge the flats that have not voted yet (once per poll)
export async function sendPollClosingReminders() {
  const out = { polls: 0, sent: 0 };
  if (!ENABLE_NOTIFICATION()) return out;
  const polls = await sql.query(
    `SELECT id, title FROM polls WHERE status='open' AND closes_at IS NOT NULL
       AND (closes_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date + 1`,
  );
  for (const p of polls) {
    const subject = `Poll closing soon: ${p.title}`;
    const [done] = await sql.query(
      "SELECT 1 AS x FROM notification_logs WHERE sent_by='system' AND subject=$1 LIMIT 1",
      [subject],
    );
    if (done) continue;
    const flats = await sql.query(
      "SELECT flat, email, phone FROM flats WHERE flat NOT IN (SELECT flat FROM poll_votes WHERE poll_id=$1)",
      [p.id],
    );
    let sent = 0;
    for (const f of flats) {
      const r = await sendNotification({
        type: "reminder",
        subject,
        message: `The poll "${p.title}" closes tomorrow and we have not received a vote from flat ${f.flat}. Please open the app and vote.`,
        channel: "all",
        recipient: { flat: f.flat, email: f.email, phone: f.phone },
      });
      if (r.emailSent || r.smsSent || r.whatsappSent) sent++;
    }
    await sql.query(
      "INSERT INTO notification_logs(sent_by,channel,target,subject,message,status) VALUES('system','all',$1,$2,$3,$4)",
      [
        `Flats yet to vote (${flats.length})`,
        subject,
        `Automatic poll reminder for "${p.title}"`,
        flats.length && !sent ? "failed" : "sent",
      ],
    );
    out.polls++;
    out.sent += sent;
  }
  return out;
}

// Overdue reminders for the latest month: the morning after the due day, then every 7 days, at most 5 times.
export async function sendOverdueReminders(now = new Date()) {
  const out = { sent: 0, flats: 0 };
  if (!ENABLE_NOTIFICATION()) return out;
  const [st] = await sql.query(
    "SELECT value FROM settings WHERE key='columns' LIMIT 1",
  );
  const s = st?.value || {};
  const dueDay = Math.trunc(Number(s.dueDay) || 0);
  if (s.autoReminders !== true || dueDay <= 0) return out;
  const [latest] = await sql.query(
    "SELECT * FROM months ORDER BY month DESC LIMIT 1",
  );
  if (!latest) return out;
  const [ly, lm] = String(latest.month).split("-").map(Number) as [
    number,
    number,
  ];
  const lastDay = new Date(ly, lm, 0).getDate();
  const dueUtc = Date.UTC(ly, lm - 1, Math.min(dueDay, lastDay));
  const days = Math.round((istToday(now).utc - dueUtc) / 86400000);
  if (days < 1 || days > 29 || (days !== 1 && days % 7 !== 1)) return out;
  const subject = `Maintenance reminder – ${latest.month}`;
  const [done] = await sql.query(
    "SELECT 1 AS x FROM notification_logs WHERE sent_by='system' AND subject=$1 AND sent_at >= now() - interval '20 hours' LIMIT 1",
    [subject],
  );
  if (done) return out;
  const flats = await sql.query("SELECT flat, email, phone FROM flats");
  const payments = await sql.query(
    "SELECT flat, maint, corp FROM payments WHERE month=$1",
    [latest.month],
  );
  const snap = snapshotOf(latest.month, latest, flats, payments);
  const orgName = String(s.orgName || s.orgShort || APP_BRAND_NAME).trim();
  for (const f of flats) {
    const due = (snap.due[f.flat] || 0) + (snap.cdue[f.flat] || 0);
    const paid = (snap.paid[f.flat] || 0) + (snap.cpaid[f.flat] || 0);
    const owed = Math.round((due - paid) * 100) / 100;
    if (owed <= 0.005) continue;
    out.flats++;
    const r = await sendNotification({
      type: "reminder",
      subject,
      message: `Dear resident of flat ${f.flat}, the ${latest.month} maintenance due date has passed and ₹${owed.toLocaleString("en-IN")} is still pending. Please pay at the earliest. If you have already paid, please ignore this message. – ${orgName}`,
      channel: "all",
      recipient: { flat: f.flat, email: f.email, phone: f.phone },
    });
    if (r.emailSent || r.smsSent || r.whatsappSent) out.sent++;
  }
  await sql.query(
    "INSERT INTO notification_logs(sent_by,channel,target,subject,message,status) VALUES('system','all',$1,$2,$3,$4)",
    [
      `Overdue flats (${out.flats})`,
      subject,
      `Automatic overdue reminder for ${latest.month}`,
      out.flats && !out.sent ? "failed" : "sent",
    ],
  );
  return out;
}

const KEEP = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

// Daily job (Vercel cron -> api/cron.js). Always: a tiny query so a free Supabase project never idles into a pause,
// and housekeeping. With AUTO_BACKUP: one backup a day kept in the database, e-mailed on Mondays when configured.
export async function runDaily(now = new Date()) {
  await sql.query("SELECT 1");
  await sql.query(
    "DELETE FROM login_attempts WHERE first_at < now() - interval '1 day'",
  );
  const [ret] = await sql.query(
    "SELECT value FROM settings WHERE key='retention' LIMIT 1",
  );
  const r = ret?.value || {};
  await sql.query(
    "DELETE FROM tickets WHERE deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => $1::int)",
    [Math.max(7, Number(r.tickets) || 365)],
  );
  await sql.query(
    "DELETE FROM contact_submissions WHERE submitted_at < now() - make_interval(days => $1::int)",
    [Math.max(7, Number(r.contacts) || 365)],
  );
  await sql.query(
    "DELETE FROM audit_log WHERE at < now() - make_interval(days => $1::int)",
    [Math.max(7, Number(r.audit) || 730)],
  );
  await sql.query(
    "DELETE FROM security_events WHERE at < now() - make_interval(days => $1::int)",
    [Math.max(7, Number(r.security) || 90)],
  );
  let reminders = { sent: 0, flats: 0 };
  try {
    reminders = await sendOverdueReminders(now);
  } catch (e) {
    console.error("overdue reminders failed", e);
  }
  let polls = { polls: 0, sent: 0 };
  try {
    polls = await sendPollClosingReminders();
  } catch (e) {
    console.error("poll reminders failed", e);
  }
  const out = {
    keepAlive: true,
    backup: false,
    emailed: false,
    reminders,
    polls,
  };
  if (!AUTO_BACKUP()) return out;
  const [last] = await sql.query(
    "SELECT (at >= date_trunc('day', now())) AS today FROM backups ORDER BY id DESC LIMIT 1",
  );
  if (last?.today) return out; // already done today
  const data = await dump((t) => sql.query(t));
  await sql.query("INSERT INTO backups(data) VALUES($1::jsonb)", [
    JSON.stringify(data),
  ]);
  await sql.query(
    "DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT $1)",
    [KEEP()],
  );
  out.backup = true;
  if (MAIL() && process.env.BACKUP_EMAIL && now.getUTCDay() === 1) {
    try {
      const [settingsRow] = await sql.query(
        "SELECT value FROM settings WHERE key=$1 LIMIT 1",
        ["columns"],
      );
      const orgName = String(
        settingsRow?.value?.orgName ||
          settingsRow?.value?.orgShort ||
          APP_BRAND_NAME,
      ).trim();
      const orgShort =
        String(
          settingsRow?.value?.orgShort ||
            settingsRow?.value?.orgName ||
            APP_BRAND_SHORT,
        )
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "cedar-grove";
      await sendMail({
        to: process.env.BACKUP_EMAIL,
        subject: `${orgName} backup ${now.toISOString().slice(0, 10)}`,
        text: `Weekly backup of the ${orgName} maintenance data (JSON). Restore with: npm run db -- restore backup.json`,
        attachments: [
          {
            filename: `${orgShort}-backup-${now.toISOString().slice(0, 10)}.json`,
            content: Buffer.from(JSON.stringify(data)).toString("base64"),
          },
        ],
      });
      out.emailed = true;
    } catch (e) {
      console.error("backup e-mail failed", e);
    }
  }
  return out;
}
