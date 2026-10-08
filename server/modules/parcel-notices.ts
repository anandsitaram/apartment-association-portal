import { sql } from "../db.js";
import { fail } from "../http.js";
import { sendMail } from "../mail.js";
import { encryptData } from "../crypto.js";
import type { Action } from "../types";

const PHOTO_LIMIT = 750_000;
const normalizeFlat = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export const actions: Record<string, Action> = {
  createParcelNotice: {
    role: "security",
    async run(b, ctx) {
      const flatInput = String(b.flat || "")
        .trim()
        .slice(0, 30);
      const courier = String(b.courier || "")
        .trim()
        .slice(0, 100);
      const tracking = String(b.trackingNumber || "")
        .trim()
        .slice(0, 100);
      const notes = String(b.notes || "")
        .trim()
        .slice(0, 500);
      const photoData = String(b.photoData || "");
      if (!flatInput) fail(400, "Select or enter the destination flat.");
      if (
        !(
          photoData.startsWith("data:image/jpeg;base64,") ||
          photoData.startsWith("data:image/png;base64,")
        ) ||
        photoData.length > PHOTO_LIMIT
      ) {
        fail(
          400,
          "Parcel photo is missing or too large. Please retake the photo.",
        );
      }
      const flats = await sql.query("SELECT flat FROM flats ORDER BY flat");
      const key = normalizeFlat(flatInput);
      const exact = flats.find(
        (r) => normalizeFlat(String(r.flat || "")) === key,
      );
      const matches = exact
        ? [exact]
        : flats.filter((r) =>
            normalizeFlat(String(r.flat || "")).startsWith(key),
          );
      if (matches.length !== 1)
        fail(
          400,
          matches.length
            ? "More than one flat matches. Enter the full flat number."
            : "Flat not found. Check the flat number.",
        );
      const flat = String(matches[0].flat);
      const [notice] = await sql.query(
        `INSERT INTO parcel_notices(flat,courier,tracking_number,notes,photo_data,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,flat,courier,tracking_number,notes,status,created_by,created_at`,
        [
          flat,
          courier ? encryptData(courier) : "",
          tracking ? encryptData(tracking) : "",
          notes ? encryptData(notes) : "",
          encryptData(photoData),
          ctx.me.username,
        ],
      );
      try {
        const owners = await sql.query(
          `SELECT email FROM users WHERE regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower($1), '[^a-z0-9]', '', 'g') AND role='user' AND COALESCE(email,'')<>''`,
          [flat],
        );
        const [flatRow] = await sql.query(
          `SELECT email FROM flats WHERE regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower($1), '[^a-z0-9]', '', 'g')`,
          [flat],
        );
        const recipients = [
          ...new Set(
            [
              ...owners.map((o) => String(o.email || "").trim()),
              String(flatRow?.email || "").trim(),
            ].filter(Boolean),
          ),
        ];
        for (const to of recipients) {
          try {
            await sendMail({
              to,
              subject: `My Apartment: parcel delivered for flat ${flat}`,
              text: `Security has recorded a parcel for flat ${flat}. Please sign in to My Apartment to view the parcel details and photo and mark it collected.`,
            });
          } catch (error) {
            console.warn(
              "parcel notice email failed",
              (error as Error).message,
            );
          }
        }
      } catch (error) {
        console.warn(
          "parcel notice recipient lookup failed",
          (error as Error).message,
        );
      }
      ctx.audit = {
        target: "parcel-notice",
        detail: { id: notice.id, flat, action: "created" },
      };
      return { notice };
    },
  },
  listParcelNotices: {
    role: "user",
    async run(_b, ctx) {
      // Parcel data is resident-owner only. Admin roles receive no resident parcel records.
      if (ctx.me.role !== "user" || !ctx.me.flat) return { notices: [] };
      const notices = await sql.query(
        `SELECT id,flat,courier,tracking_number,notes,photo_data,status,created_by,created_at,acknowledged_by,acknowledged_at FROM parcel_notices WHERE deleted_at IS NULL AND regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower(COALESCE($1,'')), '[^a-z0-9]', '', 'g') ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100`,
        [ctx.me.flat],
      );
      return { notices };
    },
  },
  listPendingParcelNotifications: {
    role: "user",
    async run(_b, ctx) {
      if (ctx.me.role !== "user" || !ctx.me.flat) return { notices: [] };
      const notices = await sql.query(
        `SELECT id,flat,courier,status,created_at FROM parcel_notices WHERE deleted_at IS NULL AND status='pending' AND regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower(COALESCE($1,'')), '[^a-z0-9]', '', 'g') ORDER BY created_at DESC LIMIT 100`,
        [ctx.me.flat],
      );
      return { notices };
    },
  },
  getParcelNotice: {
    role: "user",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid parcel notice.");
      if (ctx.me.role !== "user" || !ctx.me.flat)
        fail(403, "Only the flat owner can view this parcel.");
      const [notice] = await sql.query(
        `SELECT id,flat,courier,tracking_number,notes,photo_data,status,created_by,created_at,acknowledged_by,acknowledged_at
         FROM parcel_notices
         WHERE id=$1 AND deleted_at IS NULL
           AND regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower(COALESCE($2,'')), '[^a-z0-9]', '', 'g')`,
        [id, ctx.me.flat],
      );
      if (!notice) fail(404, "Parcel notice not found or no longer available.");
      return { notice };
    },
  },
  deleteParcelNotice: {
    role: "user",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid parcel notice.");
      if (ctx.me.role !== "user" || !ctx.me.flat)
        fail(403, "Only the flat owner can delete this parcel.");
      const [existing] = await sql.query(
        `SELECT id,flat FROM parcel_notices WHERE id=$1 AND deleted_at IS NULL`,
        [id],
      );
      if (!existing) fail(404, "Parcel notice not found or already deleted.");
      if (
        !ctx.me.flat ||
        normalizeFlat(ctx.me.flat) !== normalizeFlat(String(existing.flat))
      )
        fail(403, "You can only delete parcels delivered to your own flat.");
      await sql.query(
        `UPDATE parcel_notices SET deleted_at=now(),deleted_by=$2 WHERE id=$1 AND deleted_at IS NULL`,
        [id, ctx.me.username],
      );
      ctx.audit = {
        target: "parcel-notice",
        detail: { id, flat: existing.flat, action: "deleted" },
      };
      return { ok: true };
    },
  },
  deleteParcelPhoto: {
    role: "user",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid parcel notice.");
      if (ctx.me.role !== "user")
        fail(403, "Only the flat owner can delete this parcel photo.");
      const [existing] = await sql.query(
        `SELECT id,flat,photo_data FROM parcel_notices WHERE id=$1 AND deleted_at IS NULL`,
        [id],
      );
      if (!existing) fail(404, "Parcel notice not found.");
      if (
        !ctx.me.flat ||
        normalizeFlat(ctx.me.flat) !== normalizeFlat(String(existing.flat))
      ) {
        fail(403, "You can only delete parcel photos for your own flat.");
      }
      if (!String(existing.photo_data || ""))
        fail(409, "This parcel photo has already been deleted.");
      await sql.query(`UPDATE parcel_notices SET photo_data='' WHERE id=$1`, [
        id,
      ]);
      ctx.audit = {
        target: "parcel-notice",
        detail: { id, flat: existing.flat, action: "photo-deleted" },
      };
      return { ok: true };
    },
  },
  acknowledgeParcelNotice: {
    role: "user",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid parcel notice.");
      if (ctx.me.role !== "user")
        fail(403, "Only the flat owner can acknowledge this parcel.");
      const [existing] = await sql.query(
        `SELECT id,flat,status FROM parcel_notices WHERE id=$1 AND deleted_at IS NULL`,
        [id],
      );
      if (!existing) fail(404, "Parcel notice not found.");
      if (
        !ctx.me.flat ||
        normalizeFlat(ctx.me.flat) !== normalizeFlat(String(existing.flat))
      )
        fail(
          403,
          "You can only acknowledge parcels delivered to your own flat.",
        );
      if (existing.status !== "pending")
        fail(409, "This parcel has already been marked collected.");
      const [notice] = await sql.query(
        `UPDATE parcel_notices SET status='collected',acknowledged_by=$2,acknowledged_at=now() WHERE id=$1 AND status='pending' RETURNING id,flat,status,acknowledged_by,acknowledged_at`,
        [id, ctx.me.username],
      );
      if (!notice) fail(409, "This parcel has already been marked collected.");
      ctx.audit = {
        target: "parcel-notice",
        detail: { id, flat: existing.flat, action: "collected" },
      };
      return { notice };
    },
  },
};
