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
  createPoll: {
    role: "admin",
    flag: POLLS,
    async run(b, ctx) {
      const p = pollBody(b);
      await sql.query(
        `INSERT INTO polls(title,description,options,created_by,closes_at) VALUES($1,$2,$3::jsonb,$4,$5)`,
        [
          p.title,
          p.description,
          JSON.stringify(p.options),
          ctx.me.username,
          p.closesAt,
        ],
      );
      ctx.audit = { target: p.title, detail: { options: p.options.length } };
    },
  },

  votePoll: {
    role: "user",
    flag: POLLS,
    async run(b, ctx) {
      const v = pollVoteBody(b);
      const [poll] = await sql.query(
        "SELECT options, status, closes_at FROM polls WHERE id=$1",
        [v.pollId],
      );
      if (!poll) fail(404, "Poll not found");
      if (
        poll.status !== "open" ||
        (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now())
      )
        fail(400, "This poll is closed");
      if (v.optionIndex >= (poll.options || []).length)
        fail(400, "Invalid option");
      const flat = ctx.me.flat || ctx.me.username;
      await sql.query(
        `INSERT INTO poll_votes(poll_id,flat,option_index) VALUES($1,$2,$3) ON CONFLICT(poll_id,flat) DO UPDATE SET option_index=$3, at=now()`,
        [v.pollId, flat, v.optionIndex],
      );
      ctx.audit = {
        target: `poll#${v.pollId}`,
        detail: { optionIndex: v.optionIndex },
      };
    },
  },

  closePoll: {
    role: "admin",
    flag: POLLS,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const updated = await sql.query(
        "UPDATE polls SET status='closed' WHERE id=$1 RETURNING id",
        [id, ctx.me.username],
      );
      if (!updated.length) fail(404, "Poll not found");
      ctx.audit = { target: `poll#${id}`, detail: { status: "closed" } };
    },
  },

  deletePoll: {
    role: "super",
    flag: POLLS,
    async run(b, ctx) {
      const id = Math.trunc(+b.id) || 0;
      const removed = await sql.query(
        "UPDATE polls SET deleted_at=now(), deleted_by=$2 WHERE id=$1 AND deleted_at IS NULL RETURNING id",
        [id],
      );
      if (!removed.length) fail(404, "Poll not found");
      ctx.audit = { target: `poll#${id}`, detail: {} };
    },
  },
};
