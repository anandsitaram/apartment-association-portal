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
  createTicket: {
    role: "user",
    flag: TICKETS,
    async run(b, ctx) {
      const t = ticketBody(b);
      let flat = "";
      if (["user"].includes(ctx.me.role)) {
        flat = ctx.me.flat || "";
        if (!flat)
          fail(
            400,
            "Your login isn't linked to a flat; ask the admin to raise this for you",
          );
      } else if (b.flat) {
        flat = flatOf(b.flat);
      }
      await sql.query(
        `INSERT INTO tickets(category,title,description,flat,created_by) VALUES($1,$2,$3,$4,$5)`,
        [t.category, t.title, t.description, flat, ctx.me.username],
      );
      ctx.audit = {
        target: flat || ctx.me.username,
        detail: { category: t.category, title: t.title },
      };
    },
  },

  updateTicketStatus: {
    role: "admin",
    flag: TICKETS,
    async run(b, ctx) {
      const t = ticketStatusBody(b);
      const updated = await sql.query(
        `UPDATE tickets SET status=$2, note=COALESCE(NULLIF($3,''), note), updated_at=now(), decided_by=$4, decided_at=now() WHERE id=$1 RETURNING id, flat`,
        [t.id, t.status, t.note, ctx.me.username],
      );
      if (!updated.length) fail(404, "Ticket not found");
      const flat = updated[0].flat;
      if (flat) {
        const [flatUser] = await sql.query(
          "SELECT email, phone FROM flats WHERE flat=$1",
          [flat],
        );
        if (flatUser) {
          const subject = `Ticket #${t.id} status updated to ${t.status}`;
          const message = `Your ticket #${t.id} status has been updated to: ${t.status}.${t.note ? " Note: " + t.note : ""}`;
          const r = await sendNotification({
            type: "ticket_updated",
            subject,
            message,
            recipient: { flat, email: flatUser.email, phone: flatUser.phone },
          });
          await logAutoNotification(
            `Flat ${flat}`,
            subject,
            message,
            r.emailSent || r.smsSent || r.whatsappSent,
          );
        }
      }
      ctx.audit = {
        target: `ticket#${t.id}`,
        detail: { status: t.status, flat: updated[0].flat },
      };
    },
  },

  deleteTicket: {
    role: "super",
    flag: TICKETS,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const removed = await sql.query(
        "UPDATE tickets SET deleted_at=now(), deleted_by=$2 WHERE id=$1 AND deleted_at IS NULL RETURNING id",
        [id, ctx.me.username],
      );
      if (!removed.length) fail(404, "Ticket not found");
      ctx.audit = { target: `ticket#${id}`, detail: {} };
    },
  },
};
