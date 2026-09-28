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
  saveCorpusEntry: {
    role: "admin",
    async run(b, ctx) {
      const e = corpusEntryBody(b);
      const [row] = await sql.query(
        `INSERT INTO corpus_ledger(month,kind,source,description,amount) VALUES($1,$2,'manual',$3,$4) RETURNING id`,
        [e.month, e.kind, e.description, e.amount],
      );
      ctx.audit = { target: `#${row.id}`, detail: e };
    },
  },

  deleteCorpusEntry: {
    role: "super",
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const removed = await sql.query(
        `DELETE FROM corpus_ledger WHERE id=$1 AND source='manual' RETURNING id`,
        [id],
      );
      if (!removed.length) fail(404, "Entry not found");
      ctx.audit = { target: `#${id}`, detail: {} };
    },
  },

  closeMonth: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      const [m] = await sql.query(
        "SELECT expenses FROM months WHERE month=$1",
        [month],
      );
      if (!m) fail(404, "Month does not exist");
      const pays = await sql.query(
        "SELECT maint FROM payments WHERE month=$1",
        [month],
      );
      const collected = pays.reduce((s, p) => s + (+p.maint || 0), 0);
      const spent = ((m.expenses || []) as Row[]).reduce(
        (s: number, e) => s + (+e.amount || 0),
        0,
      );
      const remaining = Math.round((collected - spent) * 100) / 100;
      if (remaining <= 0)
        fail(
          400,
          "Nothing left over this month (maintenance collected does not exceed expenses)",
        );
      await sql.query(
        `INSERT INTO corpus_ledger(month,kind,source,description,amount)
         VALUES($1,'deposit','month_end',$2,$3)
         ON CONFLICT (month) WHERE source='month_end'
         DO UPDATE SET amount=EXCLUDED.amount, description=EXCLUDED.description, at=now()`,
        [
          month,
          `Month-end transfer – leftover maintenance for ${month}`,
          remaining,
        ],
      );
      ctx.audit = { target: month, detail: { remaining } };
      return { remaining };
    },
  },
};
