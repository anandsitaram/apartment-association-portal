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
  createBooking: {
    role: "user",
    flag: HALL_BOOKING,
    async run(b, ctx) {
      const bk = bookingBody(b);
      let flat = "";
      if (["user"].includes(ctx.me.role)) {
        flat = ctx.me.flat || "";
        if (!flat)
          fail(
            400,
            "Your login isn't linked to a flat; ask the admin to book for you",
          );
      } else if (b.flat) {
        flat = flatOf(b.flat);
      }
      const overlap = await sql.query(
        `SELECT id FROM hall_bookings WHERE status='approved' AND starts_at < $2 AND ends_at > $1 LIMIT 1`,
        [bk.startsAt, bk.endsAt],
      );
      if (overlap.length)
        fail(
          409,
          "That slot overlaps an already-approved booking. Pick another time.",
        );
      const [settingsRow] = await sql.query(
        "SELECT value FROM settings WHERE key='columns'",
      );
      const bookingAmount = Math.max(
        0,
        Number(settingsRow?.value?.hallBookingAmount || 0),
      );
      await sql.query(
        `INSERT INTO hall_bookings(flat,title,starts_at,ends_at,created_by,note,booking_amount) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          flat,
          bk.title,
          bk.startsAt,
          bk.endsAt,
          ctx.me.username,
          bk.note,
          bookingAmount,
        ],
      );
      ctx.audit = {
        target: flat || ctx.me.username,
        detail: { title: bk.title, startsAt: bk.startsAt, endsAt: bk.endsAt },
      };
    },
  },

  updateBookingStatus: {
    role: "admin",
    flag: HALL_BOOKING,
    async run(b, ctx) {
      const bs = bookingStatusBody(b);
      const [existing] = await sql.query(
        "SELECT * FROM hall_bookings WHERE id=$1",
        [bs.id],
      );
      if (!existing) fail(404, "Booking not found");
      if (bs.status === "approved") {
        if (new Date(existing.starts_at).getTime() <= Date.now())
          fail(400, "A booking that has already started cannot be approved");
        const overlap = await sql.query(
          `SELECT id FROM hall_bookings WHERE status='approved' AND id<>$1 AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
          [bs.id, existing.starts_at, existing.ends_at],
        );
        if (overlap.length)
          fail(
            409,
            "Another approved booking already holds an overlapping slot",
          );
      }
      await sql.query(
        `UPDATE hall_bookings SET status=$2, note=COALESCE(NULLIF($3,''), note), decided_by=$4, decided_at=now() WHERE id=$1`,
        [bs.id, bs.status, bs.note, ctx.me.username],
      );
      if (existing.flat) {
        const [flatUser] = await sql.query(
          "SELECT email, phone FROM flats WHERE flat=$1",
          [existing.flat],
        );
        if (flatUser) {
          const subject = `Party Hall Booking #${bs.id} ${bs.status}`;
          const message = `Your party hall booking for ${existing.title} has been ${bs.status}.${bs.note ? " Note: " + bs.note : ""}`;
          const r = await sendNotification({
            type: "booking_updated",
            subject,
            message,
            recipient: {
              flat: existing.flat,
              email: flatUser.email,
              phone: flatUser.phone,
            },
          });
          await logAutoNotification(
            `Flat ${existing.flat}`,
            subject,
            message,
            r.emailSent || r.smsSent || r.whatsappSent,
          );
        }
      }
      ctx.audit = { target: `booking#${bs.id}`, detail: { status: bs.status } };
    },
  },

  deleteBooking: {
    role: "super",
    flag: HALL_BOOKING,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const [existing] = await sql.query(
        "SELECT id, flat, title, starts_at, ends_at, status FROM hall_bookings WHERE id=$1",
        [id],
      );
      if (!existing) fail(404, "Booking not found");
      await sql.query(
        "UPDATE hall_bookings SET deleted_at=now(), deleted_by=$2 WHERE id=$1 AND deleted_at IS NULL",
        [id, ctx.me.username],
      );
      ctx.audit = {
        target: `booking#${id}`,
        detail: {
          action: "deleted",
          flat: existing.flat,
          title: existing.title,
          status: existing.status,
        },
      };
    },
  },

  cancelBooking: {
    role: "user",
    flag: HALL_BOOKING,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const [existing] = await sql.query(
        "SELECT * FROM hall_bookings WHERE id=$1",
        [id],
      );
      if (!existing) fail(404, "Booking not found");
      const staff = !["user"].includes(ctx.me.role);
      if (!staff && existing.flat !== (ctx.me.flat || ""))
        fail(403, "You can only cancel your own flat's booking");
      if (!["pending", "approved"].includes(existing.status))
        fail(400, "This booking can no longer be cancelled");
      await sql.query(
        "UPDATE hall_bookings SET status='cancelled', decided_by=$2, decided_at=now() WHERE id=$1",
        [id, ctx.me.username],
      );
      ctx.audit = { target: `booking#${id}`, detail: { status: "cancelled" } };
    },
  },

  createGymBooking: {
    role: "user",
    flag: GYM_BOOKING,
    async run(b, ctx) {
      const bk = bookingBody(b);
      let flat = "";
      if (["user"].includes(ctx.me.role)) {
        flat = ctx.me.flat || "";
        if (!flat)
          fail(
            400,
            "Your login isn't linked to a flat; ask the admin to book for you",
          );
      } else if (b.flat) {
        flat = flatOf(b.flat);
      }
      const overlap = await sql.query(
        `SELECT id FROM gym_bookings WHERE status='approved' AND starts_at < $2 AND ends_at > $1 LIMIT 1`,
        [bk.startsAt, bk.endsAt],
      );
      if (overlap.length)
        fail(
          409,
          "That slot overlaps an already-approved gym session. Pick another time.",
        );
      await sql.query(
        `INSERT INTO gym_bookings(flat,title,starts_at,ends_at,created_by,note) VALUES($1,$2,$3,$4,$5,$6)`,
        [flat, bk.title, bk.startsAt, bk.endsAt, ctx.me.username, bk.note],
      );
      ctx.audit = {
        target: flat || ctx.me.username,
        detail: { title: bk.title, startsAt: bk.startsAt, endsAt: bk.endsAt },
      };
    },
  },

  updateGymBookingStatus: {
    role: "admin",
    flag: GYM_BOOKING,
    async run(b, ctx) {
      const bs = bookingStatusBody(b);
      const [existing] = await sql.query(
        "SELECT * FROM gym_bookings WHERE id=$1",
        [bs.id],
      );
      if (!existing) fail(404, "Gym booking not found");
      if (bs.status === "approved") {
        if (new Date(existing.starts_at).getTime() <= Date.now())
          fail(400, "A booking that has already started cannot be approved");
        const overlap = await sql.query(
          `SELECT id FROM gym_bookings WHERE status='approved' AND id<>$1 AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
          [bs.id, existing.starts_at, existing.ends_at],
        );
        if (overlap.length)
          fail(
            409,
            "Another approved gym session already holds an overlapping slot",
          );
      }
      await sql.query(
        `UPDATE gym_bookings SET status=$2, note=COALESCE(NULLIF($3,''), note), decided_by=$4, decided_at=now() WHERE id=$1`,
        [bs.id, bs.status, bs.note, ctx.me.username],
      );
      if (existing.flat) {
        const [flatUser] = await sql.query(
          "SELECT email, phone FROM flats WHERE flat=$1",
          [existing.flat],
        );
        if (flatUser) {
          const subject = `Gym Booking #${bs.id} ${bs.status}`;
          const message = `Your gym booking session for ${existing.title} has been ${bs.status}.${bs.note ? " Note: " + bs.note : ""}`;
          const r = await sendNotification({
            type: "booking_updated",
            subject,
            message,
            recipient: {
              flat: existing.flat,
              email: flatUser.email,
              phone: flatUser.phone,
            },
          });
          await logAutoNotification(
            `Flat ${existing.flat}`,
            subject,
            message,
            r.emailSent || r.smsSent || r.whatsappSent,
          );
        }
      }
      ctx.audit = {
        target: `gym_booking#${bs.id}`,
        detail: { status: bs.status },
      };
    },
  },

  deleteGymBooking: {
    role: "super",
    flag: GYM_BOOKING,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const [existing] = await sql.query(
        "SELECT id, flat, title, starts_at, ends_at, status FROM gym_bookings WHERE id=$1",
        [id],
      );
      if (!existing) fail(404, "Gym booking not found");
      await sql.query(
        "UPDATE gym_bookings SET deleted_at=now(), deleted_by=$2 WHERE id=$1 AND deleted_at IS NULL",
        [id, ctx.me.username],
      );
      ctx.audit = {
        target: `gym_booking#${id}`,
        detail: {
          action: "deleted",
          flat: existing.flat,
          title: existing.title,
          status: existing.status,
        },
      };
    },
  },

  cancelGymBooking: {
    role: "user",
    flag: GYM_BOOKING,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const [existing] = await sql.query(
        "SELECT * FROM gym_bookings WHERE id=$1",
        [id],
      );
      if (!existing) fail(404, "Gym booking not found");
      const staff = !["user"].includes(ctx.me.role);
      if (!staff && existing.flat !== (ctx.me.flat || ""))
        fail(403, "You can only cancel your own flat's gym booking");
      if (!["pending", "approved"].includes(existing.status))
        fail(400, "This booking can no longer be cancelled");
      await sql.query(
        "UPDATE gym_bookings SET status='cancelled', decided_by=$2, decided_at=now() WHERE id=$1",
        [id, ctx.me.username],
      );
      ctx.audit = {
        target: `gym_booking#${id}`,
        detail: { status: "cancelled" },
      };
    },
  },
};
