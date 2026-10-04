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
import { listAudit } from "../audit.js";
import { dump, restore, protectBackup, unprotectBackup } from "../backup.js";
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
import {
  CONFIGURABLE_FEATURES,
  getFeatureConfig,
  systemFeatureEnabled,
} from "../feature-config.js";
import { fail } from "../http.js";
import { revokeSessions } from "../security.js";

export const actions: Record<string, Action> = {
  getSystemSecurity: {
    role: "super",
    async run() {
      const [m] = await sql.query(
        "SELECT value FROM settings WHERE key='maintenance' LIMIT 1",
      );
      const [r] = await sql.query(
        "SELECT value FROM settings WHERE key='retention' LIMIT 1",
      );
      const security = await sql.query(
        "SELECT id,at,type,username,ip,detail FROM security_events ORDER BY id DESC LIMIT 200",
      );
      return {
        maintenance: m?.value || { enabled: false },
        retention: r?.value || {
          tickets: 365,
          contacts: 365,
          audit: 730,
          security: 90,
        },
        security,
      };
    },
  },
  setMaintenanceMode: {
    role: "super",
    async run(b, ctx) {
      const enabled = b.enabled === true;
      const message = String(
        b.message ||
          "System maintenance in progress. Please try again shortly.",
      )
        .trim()
        .slice(0, 300);
      await sql.query(
        `INSERT INTO settings(key,value,tenant_id) VALUES('maintenance',$1::jsonb,'default') ON CONFLICT(key) DO UPDATE SET value=$1::jsonb`,
        [JSON.stringify({ enabled, message })],
      );
      ctx.audit = { target: "maintenance-mode", detail: { enabled, message } };
    },
  },
  setRetention: {
    role: "super",
    async run(b, ctx) {
      const clean = (v: any, d: number) =>
        Math.min(Math.max(Math.trunc(Number(v) || d), 7), 3650);
      const value = {
        tickets: clean(b.tickets, 365),
        contacts: clean(b.contacts, 365),
        audit: clean(b.audit, 730),
        security: clean(b.security, 90),
      };
      await sql.query(
        `INSERT INTO settings(key,value,tenant_id) VALUES('retention',$1::jsonb,'default') ON CONFLICT(key) DO UPDATE SET value=$1::jsonb`,
        [JSON.stringify(value)],
      );
      ctx.audit = { target: "data-retention", detail: value };
    },
  },
  listSecurityEvents: {
    role: "super",
    async run() {
      return {
        events: await sql.query(
          "SELECT id,at,type,username,ip,detail FROM security_events ORDER BY id DESC LIMIT 500",
        ),
      };
    },
  },
  revokeUserSessions: {
    role: "super",
    async run(b, ctx) {
      const username = String(b.username || "")
        .trim()
        .toLowerCase();
      if (!username || username === "super-admin")
        fail(400, "The built-in Super Admin session cannot be revoked here");
      const [u] = await sql.query(
        "SELECT username FROM users WHERE username=$1",
        [username],
      );
      if (!u) fail(404, "User not found");
      await revokeSessions(username);
      ctx.audit = {
        target: username,
        detail: { action: "revoke-all-sessions" },
      };
    },
  },
  restoreBackup: {
    role: "super",
    async run(b, ctx) {
      if (String(b.confirm || "") !== "RESTORE")
        fail(400, "Type RESTORE to confirm database replacement");
      let data = b.backup;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          fail(400, "Backup JSON is invalid");
        }
      }
      try {
        data = unprotectBackup(data);
      } catch (error) {
        fail(400, (error as Error).message || "Encrypted backup could not be opened. Check the server encryption key.");
      }
      await restore({ query: (text, params) => sql.query(text, params) }, data);
      ctx.audit = { target: "backup-restore", detail: { confirmed: true } };
    },
  },
  getFeatureConfig: {
    role: "developer",
    async run() {
      return {
        features: await getFeatureConfig(),
        systemAvailable: Object.fromEntries(
          CONFIGURABLE_FEATURES.map((key) => [key, systemFeatureEnabled(key)]),
        ),
      };
    },
  },

  saveFeatureConfig: {
    role: "developer",
    async run(b, ctx) {
      const incoming =
        b.features && typeof b.features === "object"
          ? (b.features as Record<string, unknown>)
          : {};
      const current = await getFeatureConfig();
      const next = { ...current };
      for (const key of CONFIGURABLE_FEATURES) {
        if (typeof incoming[key] === "boolean")
          next[key] = incoming[key] as boolean;
      }
      for (const key of CONFIGURABLE_FEATURES) {
        if (!systemFeatureEnabled(key)) next[key] = false;
      }
      if (next.notification && !systemFeatureEnabled("notification"))
        fail(400, "Notifications require ENABLE_NOTIFICATION on the server");
      if (next.reminders && !REMINDERS())
        fail(400, "Reminders require REMINDERS to be enabled on the server");
      await sql.query(
        `INSERT INTO settings(key,value) VALUES('features',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb`,
        [JSON.stringify(next)],
      );
      const changed = Object.fromEntries(
        CONFIGURABLE_FEATURES.filter((key) => current[key] !== next[key]).map(
          (key) => [key, { from: current[key], to: next[key] }],
        ),
      );
      ctx.audit = {
        target: "feature-configuration",
        detail: { changed, actorRole: ctx.me.role },
      };
      return { features: next };
    },
  },
  wipeAll: {
    role: "super",
    async run(b, ctx) {
      if (b.confirm !== "DELETE")
        fail(400, "Type DELETE to confirm wiping all data");
      await sql.query(
        `WITH d1 AS (DELETE FROM payments),
              d2 AS (DELETE FROM corpus_ledger),
              d3 AS (DELETE FROM month_archive),
              d4 AS (DELETE FROM months),
              d5 AS (DELETE FROM flats),
              d6 AS (DELETE FROM settings WHERE key <> 'schema_version')
         SELECT 1`,
      );
      ctx.audit = { target: "wipeAll", detail: {} };
    },
  },

  backup: {
    role: "admin",
    async run(b, ctx) {
      ctx.audit = { target: "download", detail: {} };
      const backup = await dump((t) => sql.query(t));
      return { backup: protectBackup(backup) };
    },
  },

  listBackups: {
    role: "admin",
    run: async () => ({
      backups: await sql.query(
        "SELECT id, at, length(data::text)::int AS size FROM backups ORDER BY id DESC",
      ),
    }),
  },

  getBackup: {
    role: "admin",
    async run(b) {
      const [r] = await sql.query("SELECT data FROM backups WHERE id=$1", [
        Math.trunc(+b.id) || 0,
      ]);
      if (!r) fail(404, "Backup not found");
      // Old database backups may predate encryption; wrap them before export.
      const backup = protectBackup(r.data);
      if (!(r.data && typeof r.data === "object" && (r.data as any).app === "rv-fallon-encrypted-backup")) {
        await sql.query("UPDATE backups SET data=$2::jsonb WHERE id=$1", [Math.trunc(+b.id) || 0, JSON.stringify(backup)]);
      }
      return { backup };
    },
  },
};
