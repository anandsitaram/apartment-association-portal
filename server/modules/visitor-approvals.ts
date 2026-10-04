import { sql } from "../db.js";
import { fail } from "../http.js";
import { sendMail } from "../mail.js";
import { encryptData } from "../crypto.js";
import type { Action } from "../types";

const PHOTO_LIMIT = 750_000;

export const actions: Record<string, Action> = {
  lookupSecurityCode: {
    role: "security",
    async run(b, ctx) {
      const raw = String(b.code || "").trim();
      const code = raw.startsWith("RVFALLON:")
        ? raw.slice("RVFALLON:".length)
        : raw;
      if (!/^\d{6}$/.test(code))
        fail(
          400,
          "Scan a valid My Apartment visitor QR code or enter the 6-digit code.",
        );
      const [row] = await sql.query(
        `SELECT id, code, visitor_name, flat, phone, purpose, visit_at, status, expires_at
         FROM security_access_codes WHERE code=$1 AND status='pending' AND expires_at > now()`,
        [code],
      );
      if (!row)
        fail(
          404,
          "Access code is invalid, expired, already used, or awaiting a different decision.",
        );
      return { visitor: row };
    },
  },

  getVisitorPhotoRequestStatus: {
    role: "security",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid visitor request.");
      const [request] = await sql.query(
        `SELECT id, visitor_name, flat, status, reviewed_at, review_note
         FROM visitor_photo_requests WHERE id=$1 AND created_by=$2`,
        [id, ctx.me.username],
      );
      if (!request) fail(404, "Visitor photo request not found.");
      return { request };
    },
  },

  createVisitorPhotoRequest: {
    role: "security",
    async run(b, ctx) {
      const accessCodeId = Number(b.accessCodeId);
      const photoData = String(b.photoData || "");
      if (!Number.isSafeInteger(accessCodeId) || accessCodeId <= 0)
        fail(400, "Scan a valid visitor access code first.");
      if (
        !(
          photoData.startsWith("data:image/jpeg;base64,") ||
          photoData.startsWith("data:image/png;base64,")
        ) ||
        photoData.length > PHOTO_LIMIT
      ) {
        fail(
          400,
          "Photo is missing or too large. Please retake the photo and try again.",
        );
      }
      const [code] = await sql.query(
        `SELECT id, code, visitor_name, flat, phone, purpose, status, expires_at
         FROM security_access_codes WHERE id=$1 AND status='pending' AND expires_at > now()`,
        [accessCodeId],
      );
      if (!code)
        fail(400, "This visitor code is no longer pending or has expired.");
      await sql.query(
        `DELETE FROM visitor_photo_requests WHERE created_at < now() - interval '90 days' AND status <> 'pending'`,
      );
      const [existingRequest] = await sql.query(
        `SELECT id, status FROM visitor_photo_requests WHERE access_code_id=$1 LIMIT 1`,
        [code.id],
      );
      if (existingRequest)
        fail(
          409,
          "A photo approval request already exists for this access code.",
        );
      const [request] = await sql.query(
        `INSERT INTO visitor_photo_requests(access_code_id, visitor_name, flat, purpose, phone, photo_data, created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, access_code_id, visitor_name, flat, purpose, phone, status, created_by, created_at`,
        [
          code.id,
          encryptData(String(code.visitor_name || "")),
          code.flat,
          encryptData(String(code.purpose || "Visitor")),
          code.phone ? encryptData(String(code.phone)) : "",
          encryptData(photoData),
          ctx.me.username,
        ],
      );
      // Email notification is best-effort. The full image remains available in the authenticated app.
      try {
        const owners = await sql.query(
          `SELECT username, email FROM users WHERE flat=$1 AND role='user' AND COALESCE(email,'')<>''`,
          [code.flat],
        );
        const [flat] = await sql.query(
          `SELECT email FROM flats WHERE flat=$1`,
          [code.flat],
        );
        const recipients = [
          ...new Set(
            [
              ...owners.map((o) => String(o.email || "").trim()),
              String(flat?.email || "").trim(),
            ].filter(Boolean),
          ),
        ];
        for (const to of recipients) {
          try {
            await sendMail({
              to,
              subject: `My Apartment: visitor approval needed for flat ${code.flat}`,
              text: `Security has submitted a visitor photo for a visitor at flat ${code.flat}. The request is pending. Please sign in to My Apartment to review the photo and approve or reject access.`,
            });
          } catch (error) {
            console.warn(
              "visitor photo email notification failed",
              (error as Error).message,
            );
          }
        }
      } catch (error) {
        console.warn(
          "visitor photo recipient lookup failed",
          (error as Error).message,
        );
      }
      ctx.audit = {
        target: "visitor-photo-request",
        detail: { id: request.id, flat: code.flat, action: "created" },
      };
      return { request };
    },
  },

  listVisitorPhotoRequests: {
    role: "user",
    async run(b, ctx) {
      // Visitor identity and photo data is resident-owner only, never admin-wide.
      if (ctx.me.role !== "user" || !ctx.me.flat) return { requests: [] };
      const requests = await sql.query(
        `SELECT id, access_code_id, visitor_name, flat, purpose, phone, photo_data, status, created_by, created_at, reviewed_by, reviewed_at, review_note
         FROM visitor_photo_requests
         WHERE regexp_replace(lower(COALESCE(flat,'')), '[^a-z0-9]', '', 'g')=regexp_replace(lower(COALESCE($1,'')), '[^a-z0-9]', '', 'g')
         ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 100`,
        [ctx.me.flat],
      );
      return { requests };
    },
  },

  reviewVisitorPhotoRequest: {
    role: "user",
    async run(b, ctx) {
      const id = Number(b.id);
      const status = String(b.status || "");
      const note = String(b.note || "")
        .trim()
        .slice(0, 500);
      if (!Number.isSafeInteger(id) || id <= 0)
        fail(400, "Invalid visitor request.");
      if (ctx.me.role !== "user")
        fail(403, "Only the flat owner can review visitor requests.");
      if (!(["approved", "rejected"] as string[]).includes(status))
        fail(400, "Choose approve or reject.");
      const [existing] = await sql.query(
        `SELECT id, flat, status, access_code_id FROM visitor_photo_requests WHERE id=$1`,
        [id],
      );
      if (!existing) fail(404, "Visitor request not found.");
      if (
        !ctx.me.flat ||
        ctx.me.flat.toLowerCase().replace(/[^a-z0-9]/g, "") !==
          String(existing.flat || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
      )
        fail(403, "You can only review visitor requests for your own flat.");
      if (existing.status !== "pending")
        fail(409, "This visitor request has already been reviewed.");
      // Change the access code and request together. Approval is permitted only
      // while the linked code is still pending and unexpired; rejection remains
      // possible for an expired request so owners can clear stale items.
      const [updated] = await sql.query(
        `WITH eligible AS (
           SELECT r.id, r.access_code_id
           FROM visitor_photo_requests r
           JOIN security_access_codes c ON c.id=r.access_code_id
           WHERE r.id=$1 AND r.status='pending' AND c.status='pending'
             AND ($2='rejected' OR c.expires_at > now())
         ), changed_code AS (
           UPDATE security_access_codes c
           SET status=CASE WHEN $2='approved' THEN 'accepted' ELSE 'rejected' END,
               accepted_by=CASE WHEN $2='approved' THEN $3 ELSE accepted_by END,
               accepted_at=CASE WHEN $2='approved' THEN now() ELSE accepted_at END
           FROM eligible e
           WHERE c.id=e.access_code_id AND c.status='pending'
             AND ($2='rejected' OR c.expires_at > now())
           RETURNING c.id
         )
         UPDATE visitor_photo_requests r
         SET status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4
         FROM eligible e
         WHERE r.id=e.id AND r.status='pending'
           AND EXISTS (SELECT 1 FROM changed_code)
         RETURNING r.id, r.flat, r.visitor_name, r.status, r.reviewed_by, r.reviewed_at, r.review_note, r.access_code_id`,
        [id, status, ctx.me.username, note ? encryptData(note) : ""],
      );
      if (!updated)
        fail(
          409,
          status === "approved"
            ? "This visitor code has expired or already been reviewed. Ask security to create a new code."
            : "This visitor request has already been reviewed.",
        );
      ctx.audit = {
        target: "visitor-photo-request",
        detail: { id, flat: updated.flat, status },
      };
      return { request: updated };
    },
  },
};
