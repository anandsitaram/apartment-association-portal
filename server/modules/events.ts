import { EVENTS } from "../flags.js";
import { sql } from "../db.js";
import { fail } from "../http.js";
import type { Action } from "../types";
import { eventBody } from "../validate.js";

export const actions: Record<string, Action> = {
  createEvent: {
    role: "admin",
    flag: EVENTS,
    async run(b, ctx) {
      const e = eventBody(b);
      await sql.query(
        `INSERT INTO events(title,description,location,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          e.title,
          e.description,
          e.location,
          e.startsAt,
          e.endsAt,
          ctx.me.username,
        ],
      );
      ctx.audit = {
        target: e.title,
        detail: {
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          location: e.location,
        },
      };
    },
  },
  updateEvent: {
    role: "admin",
    flag: EVENTS,
    async run(b, ctx) {
      const id = Math.trunc(Number(b.id));
      if (!Number.isInteger(id) || id <= 0) fail(400, "Invalid event");
      const e = eventBody(b);
      const [existing] = await sql.query("SELECT id FROM events WHERE id=$1", [
        id,
        ctx.me.username,
      ]);
      if (!existing) fail(404, "Event not found");
      await sql.query(
        `UPDATE events SET title=$2,description=$3,location=$4,starts_at=$5,ends_at=$6 WHERE id=$1`,
        [id, e.title, e.description, e.location, e.startsAt, e.endsAt],
      );
      ctx.audit = {
        target: `event#${id}`,
        detail: { action: "updated", title: e.title },
      };
    },
  },
  deleteEvent: {
    role: "super",
    flag: EVENTS,
    async run(b, ctx) {
      const id = Math.trunc(Number(b.id));
      if (!Number.isInteger(id) || id <= 0) fail(400, "Invalid event");
      const [existing] = await sql.query(
        "SELECT id,title FROM events WHERE id=$1",
        [id, ctx.me.username],
      );
      if (!existing) fail(404, "Event not found");
      await sql.query(
        "UPDATE events SET deleted_at=now(), deleted_by=$2 WHERE id=$1 AND deleted_at IS NULL",
        [id, ctx.me.username],
      );
      ctx.audit = {
        target: `event#${id}`,
        detail: { action: "deleted", title: existing.title },
      };
    },
  },
};
