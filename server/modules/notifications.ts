import { hash } from "../auth.js";
import { APP_BRAND_NAME } from "../../shared/branding.js";
import {
  MAIL,
  REMINDERS,
  TICKETS,
  HALL_BOOKING,
  GYM_BOOKING,
  POLLS,
  ENABLE_NOTIFICATION,
} from "../flags.js";
import { sql } from "../db.js";
import { fail } from "../http.js";
import { listAudit } from "../audit.js";
import { dump } from "../backup.js";
import { sendMail } from "../mail.js";
import { snapshotOf } from "../calculations.js";
import type { Action, Row } from "../types";
import { encryptData } from "../crypto.js";
import { sendNotification } from "../notifications.js";
import {
  bookingBody,
  bookingStatusBody,
  corpusEntryBody,
  flatBody,
  flatOf,
  monthBody,
  monthOf,
  paymentBody,
  paymentsBody,
  pollBody,
  pollVoteBody,
  rateOf,
  settingsBody,
  ticketBody,
  ticketStatusBody,
} from "../validate.js";
import { admins, logAutoNotification } from "./shared.js";

export const actions: Record<string, Action> = {
  listNotificationLogs: {
    role: "admin",
    run: async (b) => {
      const limit = Math.min(
        10000,
        Math.max(1, Math.trunc(Number(b.limit) || 1000)),
      );
      return {
        logs: await sql.query(
          "SELECT id, sent_at, sent_by, channel, target, subject, message, status FROM notification_logs ORDER BY sent_at DESC LIMIT $1",
          [limit],
        ),
      };
    },
  },

  sendNotificationMessage: {
    role: "admin",
    async run(b, ctx) {
      if (!ENABLE_NOTIFICATION())
        fail(403, "Notifications feature is disabled");
      const channel = (
        ["email", "sms", "whatsapp", "all"].includes(String(b.channel))
          ? String(b.channel)
          : "all"
      ) as "email" | "sms" | "whatsapp" | "all";
      const targetType = (
        ["all", "unpaid", "flat"].includes(String(b.targetType))
          ? String(b.targetType)
          : "all"
      ) as "all" | "unpaid" | "flat";
      const [settingsRow] = await sql.query(
        "SELECT value FROM settings WHERE key=$1 LIMIT 1",
        ["columns"],
      );
      const orgName = String(
        settingsRow?.value?.orgName ||
          settingsRow?.value?.orgShort ||
          APP_BRAND_NAME,
      ).trim();
      const subject = String(b.subject || `${orgName} Notification`).trim();
      const message = String(b.message || "").trim();

      if (!subject || !message)
        fail(400, "Subject and Message content are required");

      const flats = await sql.query("SELECT flat, email, phone FROM flats");
      let targets = flats;
      let targetLabel = "All Residents";

      if (targetType === "flat") {
        const flatCode = flatOf(b.targetFlat);
        targets = flats.filter((f) => f.flat === flatCode);
        if (!targets.length) fail(404, `Flat ${flatCode} does not exist`);
        targetLabel = `Flat ${flatCode}`;
      } else if (targetType === "unpaid") {
        targetLabel = "Unpaid Maintenance Flats";
        const [latest] = await sql.query(
          "SELECT * FROM months ORDER BY month DESC LIMIT 1",
        );
        if (!latest) {
          targets = [];
        } else {
          const payments = await sql.query(
            "SELECT flat, maint, corp FROM payments WHERE month=$1",
            [latest.month],
          );
          const snap = snapshotOf(latest.month, latest, flats, payments);
          targets = flats.filter((f) => {
            const due = (snap.due[f.flat] || 0) + (snap.cdue[f.flat] || 0);
            const paid = (snap.paid[f.flat] || 0) + (snap.cpaid[f.flat] || 0);
            return due - paid > 0.005;
          });
        }
      }

      let sentCount = 0;
      for (const t of targets) {
        const r = await sendNotification({
          type: "announcement",
          subject,
          message,
          channel,
          recipient: { flat: t.flat, email: t.email, phone: t.phone },
        });
        if (r.emailSent || r.smsSent || r.whatsappSent) sentCount++;
      }

      await sql.query(
        `INSERT INTO notification_logs(sent_by,channel,target,subject,message,status) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          ctx.me.username,
          channel,
          targetLabel,
          subject,
          message,
          targets.length && sentCount === 0 ? "failed" : "sent",
        ],
      );

      ctx.audit = {
        target: `notifications:${targetLabel}`,
        detail: { channel, count: sentCount, subject },
      };

      return { ok: true, sentCount, target: targetLabel };
    },
  },

  clearNotificationLogs: {
    role: "super",
    async run(b, ctx) {
      if (!ENABLE_NOTIFICATION())
        fail(403, "Notifications feature is disabled");
      await sql.query("DELETE FROM notification_logs");
      ctx.audit = { target: "notification_logs", detail: { cleared: true } };
      return { ok: true };
    },
  },

  sendReminders: {
    role: "admin",
    flag: REMINDERS,
    async run(b, ctx) {
      if (!MAIL())
        fail(
          400,
          "E-mail is not configured (set RESEND_API_KEY and MAIL_FROM)",
        );
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60);
      if (!items.length) fail(400, "Nothing to send");
      const emails = Object.fromEntries(
        (await sql.query("SELECT flat, email FROM flats")).map((r) => [
          r.flat,
          r.email,
        ]),
      );
      let sent = 0;
      const skipped = [];
      for (const it of items) {
        const to = emails[String(it?.flat ?? "")];
        if (!to) {
          skipped.push({ flat: it?.flat, reason: "no e-mail address" });
          continue;
        }
        try {
          await sendMail({
            to,
            subject: String(it.subject || "Maintenance reminder").slice(0, 120),
            text: String(it.text || "").slice(0, 2000),
          });
          sent++;
        } catch (e) {
          console.error("reminder failed", it.flat, e);
          skipped.push({ flat: it.flat, reason: "send failed" });
        }
      }
      await logAutoNotification(
        "Maintenance Reminders",
        "Maintenance reminder",
        `Sent to ${sent} flat(s), skipped ${skipped.length}`,
        sent > 0,
      );
      ctx.audit = {
        target: "reminders",
        detail: { sent, skipped: skipped.length },
      };
      return { ok: true, sent, skipped };
    },
  },
};
