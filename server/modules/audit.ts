import { hash } from "../auth.js";
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
import { listAudit, paymentHistory } from "../audit.js";
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
  listAudit: {
    role: "admin",
    run: async (b, ctx) => ({ entries: await listAudit(b.limit, ctx.me.role) }),
  },

  listPaymentHistory: {
    role: "admin",
    run: async (b, ctx) => ({
      entries: await paymentHistory(
        String(b.month || ""),
        String(b.flat || ""),
        ctx.me.role,
      ),
    }),
  },

  clearAuditLog: {
    role: "super",
    async run(b, ctx) {
      await sql.query("DELETE FROM audit_log");
      ctx.audit = { target: "audit_log", detail: { cleared: true } };
      return { ok: true };
    },
  },
};
