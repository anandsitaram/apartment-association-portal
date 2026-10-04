import { randomInt } from "node:crypto";
import { sql } from "../db.js";
import { fail } from "../http.js";
import { encryptData } from "../crypto.js";
import type { Action } from "../types";

export const actions: Record<string, Action> = {
  listMySecurityCodes: {
    role: "user",
    async run(_b, ctx) {
      // Admin/security roles never receive the resident visitor-code list, and
      // old codes created under earlier admin-bypass behavior are not exposed.
      if (ctx.me.role !== "user" || !ctx.me.flat) return { codes: [] };
      const codes = await sql.query(
        `SELECT id, code, visitor_name, flat, phone, purpose, visit_at, CASE WHEN status='pending' AND expires_at <= now() THEN 'expired' ELSE status END AS status, created_by, created_at, expires_at, accepted_by, accepted_at
         FROM security_access_codes
         WHERE created_by=$1 AND expires_at > now() - interval '7 days'
           AND regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower($2), '[^a-z0-9]', '', 'g')
         ORDER BY created_at DESC LIMIT 100`,
        [ctx.me.username, ctx.me.flat],
      );
      return { codes };
    },
  },
  createSecurityCode: {
    role: "user",
    async run(b, ctx) {
      const visitorName = String(b.visitorName || "")
        .trim()
        .slice(0, 100);
      let flat = String(b.flat || "")
        .trim()
        .slice(0, 30);
      const phone = String(b.phone || "")
        .trim()
        .slice(0, 30);
      const purpose =
        String(b.purpose || "Visitor")
          .trim()
          .slice(0, 100) || "Visitor";
      const visitAtRaw = String(b.visitAt || "").trim();
      const visitAt = visitAtRaw ? new Date(visitAtRaw) : null;
      if (visitAtRaw && (!visitAt || Number.isNaN(visitAt.getTime())))
        fail(400, "Enter a valid expected visit date and time");
      if (!visitorName || !flat)
        fail(400, "Visitor name and flat number are required");

      // Residents commonly enter only the flat number (e.g. "101"), while the
      // Flats directory stores labels such as "101-3BHK". Resolve short input
      // to its canonical flat label, but reject ambiguous prefixes.
      const normalizeFlat = (value: string) =>
        value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const requestedFlat = normalizeFlat(flat);
      const flatRows = await sql.query("SELECT flat FROM flats ORDER BY flat");
      const exactMatch = flatRows.find(
        (row) => normalizeFlat(String(row.flat || "")) === requestedFlat,
      );
      if (exactMatch) {
        flat = String(exactMatch.flat);
      } else {
        const matches = flatRows.filter((row) =>
          normalizeFlat(String(row.flat || "")).startsWith(requestedFlat),
        );
        if (matches.length === 1) {
          flat = String(matches[0].flat);
        } else if (matches.length > 1) {
          fail(
            400,
            `More than one flat matches "${flat}". Please enter the full flat label shown on the Flats page.`,
          );
        } else {
          fail(
            400,
            `Flat "${flat}" was not found. Check the flat number on the Flats page (for example, 101).`,
          );
        }
      }
      // Visitor identity and access codes are strictly owner-managed. Admin
      // privileges do not grant access to another flat's visitor details.
      if (ctx.me.role !== "user" || !ctx.me.flat || normalizeFlat(String(ctx.me.flat)) !== normalizeFlat(flat)) {
        fail(403, "Only the linked flat owner can create visitor access codes for their own flat.");
      }
      let code = "";
      for (let i = 0; i < 5; i++) {
        const candidate = String(randomInt(100000, 1000000));
        const [existing] = await sql.query(
          "SELECT id FROM security_access_codes WHERE code=$1",
          [candidate],
        );
        if (!existing) {
          code = candidate;
          break;
        }
      }
      if (!code)
        fail(500, "Could not generate a unique access code. Please retry.");
      const [created] = await sql.query(
        `INSERT INTO security_access_codes(code, visitor_name, flat, phone, purpose, visit_at, created_by, expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,now() + interval '24 hours')
         RETURNING id, code, visitor_name, flat, phone, purpose, visit_at, status, created_by, created_at, expires_at, accepted_by, accepted_at`,
        [code, encryptData(visitorName), flat, phone ? encryptData(phone) : "", encryptData(purpose), visitAt, ctx.me.username],
      );
      ctx.audit = {
        target: "security-access-code",
        detail: { id: created.id, flat, purpose, action: "created" },
      };
      return { code: created };
    },
  },
  deleteMySecurityCode: {
    role: "user",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid visitor code");
      if (ctx.me.role !== "user" || !ctx.me.flat) {
        fail(403, "Only the linked flat owner can delete their own visitor access codes.");
      }
      const normalizeFlat = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const [deleted] = await sql.query(
        `DELETE FROM security_access_codes
         WHERE id=$1 AND created_by=$2
           AND regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower($3), '[^a-z0-9]', '', 'g')
         RETURNING id, code, visitor_name, flat, status`,
        [id, ctx.me.username, ctx.me.flat],
      );
      if (!deleted)
        fail(
          404,
          "Visitor code not found or you do not have permission to delete it",
        );
      ctx.audit = {
        target: "security-access-code",
        detail: {
          id: deleted.id,
          flat: deleted.flat,
          action: "deleted",
          previousStatus: deleted.status,
        },
      };
      return { deleted: true, code: deleted.code };
    },
  },
  acceptSecurityCode: {
    role: "security",
    async run(b, ctx) {
      const code = String(b.code || "").trim();
      if (!/^\d{6}$/.test(code)) fail(400, "Enter the 6-digit access code");
      const [updated] = await sql.query(
        `SELECT c.id, c.visitor_name, c.flat, c.purpose, c.accepted_at
         FROM security_access_codes c
         WHERE c.code=$1 AND c.status='accepted' AND c.expires_at > now()
           AND EXISTS (SELECT 1 FROM visitor_photo_requests r WHERE r.access_code_id=c.id AND r.status='approved')`,
        [code],
      );
      if (!updated) fail(400, "This visitor has not been approved by the flat owner. Use the QR scan and photo approval workflow first.");
      ctx.audit = {
        target: "security-access-code",
        detail: { id: updated.id, flat: updated.flat, action: "approved-entry-verified" },
      };
      return { accepted: updated };
    },
  },
};
