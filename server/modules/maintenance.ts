import { hash } from "../auth.js";
import { APP_BRAND_NAME } from "../../shared/branding.js";
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
import { expenseTotalForRecalculation, snapshotOf } from "../calculations.js";
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

async function assertMonthEditable(month: string) {
  const [row] = await sql.query(
    "SELECT archived, notes FROM months WHERE month=$1",
    [month],
  );
  if (!row) fail(404, "Month does not exist");
  if (row.archived === true)
    fail(409, "This month is archived. Unarchive it before making changes.");
  if (row.notes?.completion)
    fail(409, "This month is completed. Undo Complete before making changes.");
}

const nextCalendarMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};
const money = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const displayMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );
};

export const actions: Record<string, Action> = {
  sendContactMessage: {
    role: "user",
    async run(b, ctx) {
      const name = String(b.name || "")
        .trim()
        .slice(0, 100);
      const email = String(b.email || "")
        .trim()
        .slice(0, 160);
      const subject = String(b.subject || "")
        .trim()
        .slice(0, 160);
      const message = String(b.message || "")
        .trim()
        .slice(0, 4000);
      if (!name || !email || !message)
        fail(400, "Name, email and message are required");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, "Please enter a valid email address");
      const [settingsRow] = await sql.query(
        "SELECT value FROM settings WHERE key=$1 LIMIT 1",
        ["columns"],
      );
      const destination = String(settingsRow?.value?.contactEmail || "").trim();
      if (!destination || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination))
        fail(
          400,
          "Contact email is not configured. Please ask the Super Admin to update Settings.",
        );
      const orgName = String(
        settingsRow?.value?.orgName ||
          settingsRow?.value?.orgShort ||
          APP_BRAND_NAME,
      ).trim();
      const [submission] = await sql.query(
        `INSERT INTO contact_submissions(name,email,subject,message,submitted_by,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id`,
        [
          name ? encryptData(name) : "",
          email ? encryptData(email) : "",
          subject ? encryptData(subject) : "",
          message ? encryptData(message) : "",
          ctx.me.username,
        ],
      );
      try {
        await sendMail({
          to: destination,
          subject: subject || `${orgName} - Contact Us`,
          text: [
            `New Contact Us message from ${orgName}`,
            `Name: ${name}`,
            `Email: ${email}`,
            `From account: ${ctx.me.username}`,
            `Subject: ${subject || "(No subject)"}`,
            "",
            message,
          ].join("\n"),
        });
        await sql.query(
          "UPDATE contact_submissions SET status='sent' WHERE id=$1",
          [submission?.id],
        );
      } catch (e) {
        await sql.query(
          "UPDATE contact_submissions SET status='failed', error=$2 WHERE id=$1",
          [
            submission?.id,
            e instanceof Error
              ? e.message.slice(0, 500)
              : String(e).slice(0, 500),
          ],
        );
        throw e;
      }
      ctx.audit = {
        target: "Contact Us",
        detail: {
          subject: subject || "(No subject)",
          submissionId: submission?.id,
          submittedBy: ctx.me.username,
        },
      };
      return { sent: true, submissionId: submission?.id };
    },
  },
  listContactSubmissions: {
    role: "admin",
    async run(b) {
      const limit = Math.min(Math.max(Number(b.limit) || 200, 1), 500);
      return {
        entries: await sql.query(
          `SELECT id,name,email,subject,message,submitted_by,submitted_at,status,error,read_at,read_by
           FROM contact_submissions ORDER BY id DESC LIMIT $1`,
          [limit],
        ),
      };
    },
  },
  markContactRead: {
    role: "admin",
    async run(b, ctx) {
      const id = Number(b.id);
      if (!Number.isFinite(id) || id <= 0)
        fail(400, "Invalid contact submission");
      await sql.query(
        "UPDATE contact_submissions SET read_at=now(), read_by=$2 WHERE id=$1",
        [id, ctx.me.username],
      );
      ctx.audit = {
        target: "Contact Us",
        detail: { submissionId: id, action: "marked read" },
      };
      return { ok: true };
    },
  },
  saveMonth: {
    role: "admin",
    async run(b, ctx) {
      const m = monthBody(b);
      // Never trust a stale saved calculated_expense_total when the admin explicitly
      // recalculates. Use the submitted expense rows as the authoritative basis.
      const calculatedExpenseTotal = expenseTotalForRecalculation(
        m.expenses,
        m.calculatedExpenseTotal,
        b.recalculate === true,
      );
      if (b.create !== true) await assertMonthEditable(m.month);
      if (b.create === true) {
        const exists = await sql.query("SELECT 1 FROM months WHERE month=$1", [
          m.month,
        ]);
        if (exists.length) {
          // A previous request may have created the month even if the browser
          // missed the refresh. Treat this as an idempotent create and let the
          // client reload/select the existing month rather than showing a toast error.
          return { alreadyExists: true, month: m.month };
        }
      } else if (m.notes?.expensesStage === "expected") {
        const [existing] = await sql.query(
          "SELECT notes FROM months WHERE month=$1 LIMIT 1",
          [m.month],
        );
        const existingStage =
          existing?.notes?.expensesStage === "actual" ? "actual" : "expected";
        if (
          existingStage === "actual" &&
          ctx.me.role !== "super" &&
          ctx.me.role !== "superadmin"
        ) {
          fail(
            403,
            "Only a Super Admin can reset a completed maintenance calculation",
          );
        }
      }
      await sql.query(
        `INSERT INTO months(month,expenses,method,value,rounding,corp_rate,corp_method,corp_applicable,corp_value,corp_rounding,excluded_flats,excluded_expense_flats,excluded_corp_flats,notes,calculated_expense_total) VALUES($1,$2::jsonb,$3,$4,$5,COALESCE($6::float8,0.5),COALESCE($7,'sqft'),COALESCE($8::boolean,false),COALESCE($9::float8,$6::float8,0.5),COALESCE($10,'nearest'),COALESCE($11::jsonb,'[]'::jsonb),COALESCE($12::jsonb,'[]'::jsonb),COALESCE($13::jsonb,'[]'::jsonb),COALESCE($14::jsonb,'{}'::jsonb),$15)
         ON CONFLICT(month) DO UPDATE SET expenses=$2::jsonb, method=CASE WHEN $17::boolean THEN months.method ELSE $3 END, value=CASE WHEN $17::boolean THEN months.value ELSE $4 END, rounding=CASE WHEN $17::boolean THEN months.rounding ELSE $5 END, corp_rate=CASE WHEN $17::boolean THEN months.corp_rate ELSE COALESCE($6::float8, months.corp_rate) END, corp_method=CASE WHEN $17::boolean THEN months.corp_method ELSE COALESCE($7, months.corp_method) END, corp_applicable=CASE WHEN $17::boolean THEN months.corp_applicable ELSE COALESCE($8::boolean, months.corp_applicable) END, corp_value=CASE WHEN $17::boolean THEN months.corp_value ELSE COALESCE($9::float8, months.corp_value) END, corp_rounding=CASE WHEN $17::boolean THEN months.corp_rounding ELSE COALESCE($10, months.corp_rounding) END, excluded_flats=COALESCE($11::jsonb, months.excluded_flats), excluded_expense_flats=COALESCE($12::jsonb, months.excluded_expense_flats), excluded_corp_flats=COALESCE($13::jsonb, months.excluded_corp_flats), notes=CASE WHEN COALESCE(months.notes,'{}'::jsonb) ? 'carryForward' THEN (COALESCE($14::jsonb,'{}'::jsonb) || jsonb_build_object('carryForward', months.notes->'carryForward')) ELSE COALESCE($14::jsonb, months.notes) END, calculated_expense_total=CASE WHEN $16::boolean THEN EXCLUDED.calculated_expense_total ELSE COALESCE(months.calculated_expense_total, EXCLUDED.calculated_expense_total) END`,
        [
          m.month,
          JSON.stringify(m.expenses),
          m.method,
          m.value,
          m.rounding,
          m.corpRate,
          m.corpMethod,
          m.corpApplicable,
          m.corpValue,
          m.corpRounding,
          m.excludedFlats == null ? null : JSON.stringify(m.excludedFlats),
          m.excludedExpenseFlats == null
            ? null
            : JSON.stringify(m.excludedExpenseFlats),
          m.excludedCorpFlats == null
            ? null
            : JSON.stringify(m.excludedCorpFlats),
          JSON.stringify(m.notes || {}),
          calculatedExpenseTotal,
          b.recalculate === true,
          m.notes?.expensesStage === "actual" && b.recalculate !== true,
        ],
      );
      // Merged mode stores all collected money in payments.maint; the separate
      // payments.corp field must remain zero. Fold any existing split payment into
      // the combined Maintenance entry when the month is saved in merged mode.
      if (m.notes?.mergeMaintenanceCorp === true) {
        await sql.query(
          "UPDATE payments SET maint=COALESCE(maint,0)+COALESCE(corp,0), corp=0 WHERE month=$1 AND COALESCE(corp,0)<>0",
          [m.month],
        );
      }
      await sql.query("DELETE FROM month_archive WHERE month=$1", [m.month]);
      ctx.audit = {
        target: m.month,
        detail: {
          total: m.expenses.reduce((s, e) => s + e.amount, 0),
          method: m.method,
          value: m.value,
          rounding: m.rounding,
        },
      };
    },
  },

  saveCorpRate: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      await assertMonthEditable(month);
      const rate = rateOf(b.rate);
      const updated = await sql.query(
        "UPDATE months SET corp_rate=$2 WHERE month=$1 RETURNING month",
        [month, rate],
      );
      if (!updated.length) fail(404, "Month does not exist");
      ctx.audit = { target: month, detail: { corpRate: rate } };
    },
  },

  savePayment: {
    role: "admin",
    async run(b, ctx) {
      const p = paymentBody(b);
      await assertMonthEditable(p.month);
      const [monthExists, flatExists] = await Promise.all([
        sql.query("SELECT notes FROM months WHERE month=$1", [p.month]),
        sql.query("SELECT 1 FROM flats WHERE flat=$1", [p.flat]),
      ]);
      if (!monthExists.length) fail(404, "Month does not exist");
      const mergedMonth = monthExists[0]?.notes?.mergeMaintenanceCorp === true;
      const savedMaint = mergedMonth
        ? (Number(p.maint) || 0) + (Number(p.corp) || 0)
        : p.maint;
      const savedCorp = mergedMonth ? 0 : p.corp;
      if (!flatExists.length) fail(404, `Flat ${p.flat} does not exist`);
      const [old] = await sql.query(
        "SELECT maint, corp, mode, paid_date, extra FROM payments WHERE month=$1 AND flat=$2",
        [p.month, p.flat],
      );
      await sql.query(
        `INSERT INTO payments(month,flat,maint,corp,mode,paid_date,extra) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT(month,flat) DO UPDATE SET maint=$3, corp=$4, mode=$5, paid_date=$6, extra=$7::jsonb`,
        [
          p.month,
          p.flat,
          savedMaint,
          savedCorp,
          p.mode,
          p.date,
          JSON.stringify(p.extra),
        ],
      );
      const before: Record<string, unknown> = old || {
        maint: 0,
        corp: 0,
        mode: "",
        paid_date: "",
        extra: {},
      };
      const after: Record<string, unknown> = {
        maint: savedMaint,
        corp: savedCorp,
        mode: p.mode,
        paid_date: p.date,
        extra: p.extra,
      };
      const changes: Record<string, unknown[]> = {};
      for (const k of Object.keys(after))
        if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k]))
          changes[k] = [before[k] ?? null, after[k]];
      ctx.audit = { target: `${p.month} ${p.flat}`, detail: { changes } };
    },
  },

  savePayments: {
    role: "admin",
    async run(b, ctx) {
      const { month, entries } = paymentsBody(b);
      await assertMonthEditable(month);
      const monthExists = await sql.query(
        "SELECT notes FROM months WHERE month=$1",
        [month],
      );
      if (!monthExists.length) fail(404, "Month does not exist");
      const mergedMonth = monthExists[0]?.notes?.mergeMaintenanceCorp === true;
      const flatRows = await sql.query("SELECT flat FROM flats");
      const validFlats = new Set(flatRows.map((r) => r.flat));
      const unknown = entries.find(
        (e: { flat: string }) => !validFlats.has(e.flat),
      );
      if (unknown) fail(404, `Flat ${unknown.flat} does not exist`);
      const rows = entries.map((e: Row) => ({
        flat: e.flat,
        maint: mergedMonth
          ? (Number(e.maint) || 0) + (Number(e.corp) || 0)
          : e.maint,
        corp: mergedMonth ? 0 : e.corp,
        mode: e.mode,
        paid_date: e.date,
        extra: e.extra,
      }));
      await sql.query(
        `INSERT INTO payments(month,flat,maint,corp,mode,paid_date,extra)
         SELECT $1, x.flat, x.maint, x.corp, x.mode, x.paid_date, x.extra
         FROM jsonb_to_recordset($2::jsonb) AS x(flat text, maint float8, corp float8, mode text, paid_date text, extra jsonb)
         ON CONFLICT(month,flat) DO UPDATE SET maint=EXCLUDED.maint, corp=EXCLUDED.corp, mode=EXCLUDED.mode, paid_date=EXCLUDED.paid_date, extra=EXCLUDED.extra`,
        [month, JSON.stringify(rows)],
      );
      ctx.audit = { target: month, detail: { savedFlats: entries.length } };
      return { saved: entries.length };
    },
  },

  clearPayments: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      await assertMonthEditable(month);
      const rows = await sql.query(
        "DELETE FROM payments WHERE month=$1 RETURNING flat",
        [month],
      );
      ctx.audit = { target: month, detail: { cleared: rows.length } };
    },
  },

  clearAllAmounts: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      await assertMonthEditable(month);
      const [exists] = await sql.query(
        "SELECT month, expenses FROM months WHERE month=$1",
        [month],
      );
      if (!exists) fail(404, "Month does not exist");
      const expenses = Array.isArray(exists.expenses)
        ? exists.expenses.map((e) => ({ ...e, amount: 0 }))
        : [];
      await sql.query("UPDATE months SET expenses=$2::jsonb WHERE month=$1", [
        month,
        JSON.stringify(expenses),
      ]);
      ctx.audit = {
        target: month,
        detail: { clearedExpenseLines: expenses.length },
      };
      return { ok: true, clearedExpenseLines: expenses.length };
    },
  },

  archiveMonth: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      const rows = await sql.query(
        "UPDATE months SET archived=true WHERE month=$1 RETURNING month",
        [month],
      );
      if (!rows.length) fail(404, "Month does not exist");
      ctx.audit = { target: month, detail: { archived: true } };
      return { archived: true };
    },
  },

  unarchiveMonth: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      const rows = await sql.query(
        "UPDATE months SET archived=false WHERE month=$1 RETURNING month",
        [month],
      );
      if (!rows.length) fail(404, "Month does not exist");
      ctx.audit = { target: month, detail: { archived: false } };
      return { archived: false };
    },
  },

  deleteMonth: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      const [m] = await sql.query("SELECT * FROM months WHERE month=$1", [
        month,
      ]);
      if (!m) fail(404, "Month does not exist");
      if (m.notes?.completion)
        fail(409, "Undo Complete before deleting this month.");
      const flats = await sql.query(
        "SELECT flat, bua, corp_excluded FROM flats ORDER BY sl, flat",
      );
      const payments = await sql.query(
        "SELECT month, flat, maint, corp FROM payments WHERE month=$1",
        [month],
      );
      const snap = snapshotOf(month, m, flats, payments);
      const data = JSON.stringify(snap);
      const archived = Boolean(flats.length);

      const [deleted] = await sql.query(
        `WITH archived AS (
           INSERT INTO month_archive(month,data)
           VALUES($1,$2::jsonb)
           ON CONFLICT(month) DO UPDATE SET data=EXCLUDED.data, deleted_at=now()
           RETURNING month
         ), deleted_payments AS (
           DELETE FROM payments WHERE month=$1 RETURNING month
         )
         DELETE FROM months WHERE month=$1 RETURNING month`,
        [month, data],
      );
      if (!deleted?.month)
        fail(
          409,
          "The month could not be deleted. Refresh the Months page and try again.",
        );
      ctx.audit = { target: month, detail: { keptInSummary: archived } };
      return { deleted: true, month };
    },
  },

  completeMonth: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      const combine = b.combineCarryForward === true;
      const [source] = await sql.query("SELECT * FROM months WHERE month=$1", [
        month,
      ]);
      if (!source) fail(404, "Month does not exist");
      if (source.archived === true)
        fail(409, "Unarchive this month before completing it.");
      if (source.notes?.completion)
        fail(409, "This month is already completed.");

      const nextMonth = nextCalendarMonth(month);
      const [next] = await sql.query("SELECT * FROM months WHERE month=$1", [
        nextMonth,
      ]);
      const flats = await sql.query(
        "SELECT flat, bua, excluded, corp_excluded FROM flats ORDER BY sl, flat",
      );
      const sourcePayments = await sql.query(
        "SELECT flat, maint, corp FROM payments WHERE month=$1",
        [month],
      );
      const paymentByFlat: Record<string, Row> = Object.fromEntries(
        sourcePayments.map((p) => [String(p.flat), p]),
      );
      const snap = snapshotOf(month, source, flats, sourcePayments);
      const carryRows: Record<
        string,
        { maintenance: number; corp: number; combined: boolean }
      > = {};
      for (const flat of flats) {
        const paid = paymentByFlat[String(flat.flat)] || {};
        const alreadyPaid =
          (Number(paid.maint) || 0) + (Number(paid.corp) || 0);
        const maintenanceDue = money(snap.due[String(flat.flat)]);
        const corpDue = money(snap.cdue[String(flat.flat)]);
        if (Math.abs(alreadyPaid) < 0.005 && maintenanceDue + corpDue > 0.005) {
          carryRows[String(flat.flat)] = {
            maintenance: combine
              ? money(maintenanceDue + corpDue)
              : maintenanceDue,
            corp: combine ? 0 : corpDue,
            combined: combine,
          };
        }
      }
      if (Object.keys(carryRows).length && !next) {
        fail(
          409,
          `Create ${displayMonth(nextMonth)} first so unpaid amounts can be carried forward.`,
        );
      }
      if (
        Object.keys(carryRows).length &&
        (next?.archived === true || next?.notes?.completion)
      ) {
        fail(
          409,
          `${displayMonth(nextMonth)} is archived or completed. Reopen it before carrying forward unpaid amounts.`,
        );
      }

      const previousCarry =
        next?.notes?.carryForward && typeof next.notes.carryForward === "object"
          ? JSON.parse(JSON.stringify(next.notes.carryForward))
          : null;
      const mergedCarry: Record<
        string,
        { maintenance: number; corp: number; combined: boolean }
      > = { ...(previousCarry || {}) };
      for (const [flat, amount] of Object.entries(carryRows)) {
        const previous = mergedCarry[flat];
        mergedCarry[flat] = {
          maintenance: money(
            (Number(previous?.maintenance) || 0) + amount.maintenance,
          ),
          corp: money((Number(previous?.corp) || 0) + amount.corp),
          combined: previous
            ? Boolean(previous.combined) && amount.combined
            : amount.combined,
        };
      }
      const totalCollected = sourcePayments.reduce(
        (sum, p) => sum + (Number(p.maint) || 0) + (Number(p.corp) || 0),
        0,
      );
      const actualExpenses = (
        Array.isArray(source.expenses) ? source.expenses : []
      ).reduce((sum: number, e: Row) => sum + (Number(e?.amount) || 0), 0);
      const remaining = money(totalCollected - actualExpenses);
      const [previousLedger] = await sql.query(
        "SELECT id, at, month, kind, source, description, amount FROM corpus_ledger WHERE month=$1 AND source='month_end' LIMIT 1",
        [month],
      );
      const completionKey = `month_completion:${month}`;
      const [oldSnapshot] = await sql.query(
        "SELECT key FROM settings WHERE key=$1 LIMIT 1",
        [completionKey],
      );
      if (oldSnapshot)
        fail(
          409,
          "A completion snapshot already exists. Undo the previous Complete action first.",
        );

      const completion = {
        nextMonth,
        combined: combine,
        carriedFlats: Object.keys(carryRows).length,
        remaining,
        completedAt: new Date().toISOString(),
      };
      const sourceNotes = { ...(source.notes || {}), completion };
      const targetNotes = next
        ? {
            ...(next.notes || {}),
            ...(Object.keys(carryRows).length
              ? { carryForward: mergedCarry }
              : {}),
          }
        : null;
      const undoSnapshot = {
        nextMonth: next ? nextMonth : null,
        previousNextCarryForward: previousCarry,
        previousLedger: previousLedger || null,
      };
      const [result] = await sql.query(
        `WITH saved AS (
           INSERT INTO settings(key,value) VALUES($1,$2::jsonb)
           ON CONFLICT(key) DO NOTHING RETURNING key
         ), source_updated AS (
           UPDATE months SET notes=$3::jsonb WHERE month=$4 AND EXISTS (SELECT 1 FROM saved) RETURNING month
         ), target_updated AS (
           UPDATE months SET notes=$5::jsonb WHERE month=$6 AND $6 IS NOT NULL AND $7::boolean AND EXISTS (SELECT 1 FROM saved) RETURNING month
         ), ledger_upsert AS (
           INSERT INTO corpus_ledger(month,kind,source,description,amount)
           SELECT $4,CASE WHEN $9 < 0 THEN 'withdrawal' ELSE 'deposit' END,'month_end',$8,ABS($9)
           WHERE $9 <> 0 AND EXISTS (SELECT 1 FROM saved)
           ON CONFLICT (month) WHERE source='month_end'
           DO UPDATE SET kind=EXCLUDED.kind, description=EXCLUDED.description, amount=EXCLUDED.amount, at=now()
           RETURNING id
         ), ledger_delete AS (
           DELETE FROM corpus_ledger WHERE month=$4 AND source='month_end' AND $9 = 0 AND EXISTS (SELECT 1 FROM saved) RETURNING id
         )
         SELECT (SELECT count(*) FROM saved) AS saved`,
        [
          completionKey,
          JSON.stringify(undoSnapshot),
          JSON.stringify(sourceNotes),
          month,
          JSON.stringify(targetNotes || {}),
          next ? nextMonth : null,
          Object.keys(carryRows).length > 0,
          `Month-end balance transferred to Corp Fund for ${month}`,
          remaining,
        ],
      );
      if (Number(result?.saved) !== 1)
        fail(
          409,
          "This month was completed by another request. Refresh and try again.",
        );
      ctx.audit = {
        target: month,
        detail: {
          action: "complete_month",
          nextMonth: next ? nextMonth : null,
          combined: combine,
          carriedFlats: Object.keys(carryRows).length,
          remaining,
        },
      };
      return {
        completed: true,
        nextMonth: next ? nextMonth : null,
        carriedFlats: Object.keys(carryRows).length,
        remaining,
      };
    },
  },

  undoCompleteMonth: {
    role: "admin",
    async run(b, ctx) {
      const month = monthOf(b.month);
      const completionKey = `month_completion:${month}`;
      const [source] = await sql.query(
        "SELECT notes FROM months WHERE month=$1",
        [month],
      );
      if (!source) fail(404, "Month does not exist");
      if (!source.notes?.completion)
        fail(409, "This month has not been completed.");
      const [snapshotRow] = await sql.query(
        "SELECT value FROM settings WHERE key=$1 LIMIT 1",
        [completionKey],
      );
      if (!snapshotRow?.value)
        fail(
          409,
          "The undo snapshot is missing. Do not manually change this month; contact support to restore it safely.",
        );
      const snapshot = snapshotRow.value as Row;
      const nextMonth = snapshot.nextMonth ? String(snapshot.nextMonth) : null;
      const [result] = await sql.query(
        `WITH saved AS (
           SELECT value FROM settings WHERE key=$1
         ), source_restored AS (
           UPDATE months SET notes=COALESCE(notes,'{}'::jsonb) - 'completion'
           WHERE month=$2 AND EXISTS (SELECT 1 FROM saved) RETURNING month
         ), target_restored AS (
           UPDATE months AS target SET notes = CASE
             WHEN jsonb_typeof(saved.value->'previousNextCarryForward') = 'object'
               THEN jsonb_set(COALESCE(target.notes,'{}'::jsonb), '{carryForward}', saved.value->'previousNextCarryForward', true)
             ELSE COALESCE(target.notes,'{}'::jsonb) - 'carryForward'
           END
           FROM saved WHERE target.month=saved.value->>'nextMonth' RETURNING target.month
         ), ledger_updated AS (
           UPDATE corpus_ledger AS current SET
             kind=saved.value->'previousLedger'->>'kind',
             description=saved.value->'previousLedger'->>'description',
             amount=COALESCE((saved.value->'previousLedger'->>'amount')::float8,0),
             at=COALESCE((saved.value->'previousLedger'->>'at')::timestamptz,now())
           FROM saved WHERE current.month=$2 AND current.source='month_end' AND jsonb_typeof(saved.value->'previousLedger')='object'
           RETURNING current.id
         ), ledger_deleted AS (
           DELETE FROM corpus_ledger AS current USING saved
           WHERE current.month=$2 AND current.source='month_end' AND jsonb_typeof(saved.value->'previousLedger') IS DISTINCT FROM 'object'
           RETURNING current.id
         ), ledger_inserted AS (
           INSERT INTO corpus_ledger(month,kind,source,description,amount,at)
           SELECT $2,
             saved.value->'previousLedger'->>'kind',
             saved.value->'previousLedger'->>'source',
             saved.value->'previousLedger'->>'description',
             COALESCE((saved.value->'previousLedger'->>'amount')::float8,0),
             COALESCE((saved.value->'previousLedger'->>'at')::timestamptz,now())
           FROM saved
           WHERE jsonb_typeof(saved.value->'previousLedger')='object'
             AND NOT EXISTS (SELECT 1 FROM corpus_ledger WHERE month=$2 AND source='month_end')
           RETURNING id
         ), snapshot_deleted AS (
           DELETE FROM settings WHERE key=$1 RETURNING key
         )
         SELECT (SELECT count(*) FROM source_restored) AS source_restored,
                (SELECT count(*) FROM snapshot_deleted) AS snapshot_deleted`,
        [completionKey, month],
      );
      if (
        Number(result?.source_restored) !== 1 ||
        Number(result?.snapshot_deleted) !== 1
      ) {
        fail(
          409,
          "Could not undo completion completely. Refresh and verify the month before trying again.",
        );
      }
      ctx.audit = {
        target: month,
        detail: { action: "undo_complete_month", restoredNextMonth: nextMonth },
      };
      return { undone: true, nextMonth };
    },
  },

  saveSettings: {
    role: "admin",
    async run(b, ctx) {
      const [stored] = await sql.query(
        `SELECT value FROM settings WHERE key='columns'`,
      );
      const incomingSettings = { ...(b.settings || {}) };
      const isSuper = ctx.me.role === "super" || ctx.me.role === "superadmin";
      // Admins may update operational/application settings, but never the
      // security controls that determine what other Admin accounts can delete.
      // Those controls remain owned by Super Admin and are ignored if a client
      // tries to submit them directly.
      if (!isSuper) {
        delete incomingSettings.allowAdminUserDeletion;
        delete incomingSettings.allowAdminFlatDeletion;
      }
      const s = settingsBody({
        ...(stored?.value || {}),
        ...incomingSettings,
      });
      let billedMonth = null;
      if (isSuper && b.settings?.billing != null && s.billing) {
        const [latest] = await sql.query(
          "SELECT month, archived, notes FROM months ORDER BY month DESC LIMIT 1",
        );
        if (latest && latest.archived !== true && !latest.notes?.completion) {
          await sql.query(
            "UPDATE months SET method=$2, value=$3, rounding=$4, corp_rate=$5, corp_method=$6, corp_value=$7, corp_rounding=$8 WHERE month=$1",
            [
              latest.month,
              s.billing.method,
              s.billing.value,
              s.billing.rounding,
              s.billing.corpRate,
              s.billing.corpMethod,
              s.billing.corpValue,
              s.billing.corpRounding,
            ],
          );
          billedMonth = latest.month;
        }
      }
      await sql.query(
        `INSERT INTO settings(key,value) VALUES('columns',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb`,
        [JSON.stringify(s)],
      );
      ctx.audit = {
        target: "columns",
        detail: {
          hidden: s.hidden.length,
          custom: s.custom.length,
          renamed: Object.keys(s.labels).length,
          expenseHeads: s.expenseHeads.length,
          billingAppliedTo: billedMonth,
          paymentSplit: s.paymentSplit,
        },
      };
    },
  },

  importFlats: {
    role: "admin",
    async run(b, ctx) {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const mode = b.mode === "update" ? "update" : "create";
      if (!rows.length) fail(400, "No rows found in the flat data import file");
      if (rows.length > 500)
        fail(400, "Import is limited to 500 rows at a time");
      const results: {
        row: number;
        flat: string;
        status: string;
        message?: string;
      }[] = [];
      let created = 0;
      let updated = 0;
      const parseBoolean = (value: unknown): boolean | undefined => {
        if (value == null || String(value).trim() === "") return undefined;
        const v = String(value).trim().toLowerCase();
        if (["true", "1", "yes", "y"].includes(v)) return true;
        if (["false", "0", "no", "n"].includes(v)) return false;
        throw new Error("Use TRUE or FALSE for excluded and corpExcluded");
      };
      const syncExclusions = async (
        flat: string,
        excluded?: boolean,
        corpExcluded?: boolean,
      ) => {
        if (excluded === undefined && corpExcluded === undefined) return;
        const [latest] = await sql.query(
          "SELECT month, archived, notes, excluded_flats, excluded_expense_flats, excluded_corp_flats FROM months ORDER BY month DESC LIMIT 1",
        );
        if (!latest || latest.archived === true || latest.notes?.completion)
          return;
        const put = (list: unknown, on: boolean) => {
          const rest = (Array.isArray(list) ? (list as string[]) : []).filter(
            (x) => x !== flat,
          );
          return on ? [...rest, flat] : rest;
        };
        await sql.query(
          "UPDATE months SET excluded_flats=$2::jsonb, excluded_expense_flats=$3::jsonb, excluded_corp_flats=$4::jsonb WHERE month=$1",
          [
            latest.month,
            JSON.stringify(
              put(
                latest.excluded_flats,
                excluded ??
                  (Array.isArray(latest.excluded_flats) &&
                    latest.excluded_flats.includes(flat)),
              ),
            ),
            JSON.stringify(
              put(
                latest.excluded_expense_flats,
                excluded ??
                  (Array.isArray(latest.excluded_expense_flats) &&
                    latest.excluded_expense_flats.includes(flat)),
              ),
            ),
            JSON.stringify(
              put(
                latest.excluded_corp_flats,
                corpExcluded ??
                  (Array.isArray(latest.excluded_corp_flats) &&
                    latest.excluded_corp_flats.includes(flat)),
              ),
            ),
          ],
        );
      };
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        const flatLabel = String(r.flat || "").trim();
        const rowNumber = i + 2;
        try {
          const flat = flatOf(flatLabel);
          const name = String(r.name ?? "")
            .trim()
            .slice(0, 60);
          const type = String(r.type ?? "")
            .trim()
            .slice(0, 30);
          const buaText = String(r.bua ?? "").trim();
          const udsText = String(r.uds ?? "").trim();
          const phoneText = String(r.phone ?? "").trim();
          const emailText = String(r.email ?? "").trim();
          const excluded = parseBoolean(r.excluded);
          const corpExcluded = parseBoolean(
            r.corpExcluded ?? r.corpexcluded ?? r.corp_excluded,
          );
          if (phoneText && !/^[+0-9 ()-]{6,20}$/.test(phoneText))
            throw new Error(
              "Phone: digits, spaces, + ( ) - only (6-20 characters)",
            );
          if (
            emailText &&
            !(
              emailText.length <= 80 &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)
            )
          )
            throw new Error("Enter a valid e-mail address");
          const [existing] = await sql.query(
            "SELECT flat, sl, name, type, bua, uds, phone, email, excluded, corp_excluded FROM flats WHERE flat=$1",
            [flat],
          );
          if (mode === "create") {
            if (existing) {
              results.push({
                row: rowNumber,
                flat,
                status: "skipped",
                message: "Flat number already exists",
              });
              continue;
            }
            if (
              !buaText ||
              !Number.isFinite(Number(buaText)) ||
              Number(buaText) <= 0 ||
              Number(buaText) > 100000
            )
              throw new Error(
                "Sq Ft (bua) is required and must be greater than 0",
              );
            if (
              udsText &&
              (!Number.isFinite(Number(udsText)) ||
                Number(udsText) < 0 ||
                Number(udsText) > 100000)
            )
              throw new Error("UDS must be a number from 0 to 100000");
            const [settingsRow] = await sql.query(
              "SELECT value FROM settings WHERE key='columns'",
            );
            const configuredTotal = Number(settingsRow?.value?.totalFlats || 0);
            const [{ count }] = await sql.query(
              "SELECT COUNT(*)::int AS count FROM flats",
            );
            if (configuredTotal > 0 && Number(count) >= configuredTotal)
              throw new Error(
                `The configured total of ${configuredTotal} flats has been reached`,
              );
            const [{ nextsl }] = await sql.query(
              "SELECT COALESCE(MAX(sl),0)+1 AS nextsl FROM flats",
            );
            await sql.query(
              "INSERT INTO flats(flat,sl,name,type,bua,uds,phone,email,excluded,corp_excluded) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [
                flat,
                Number(nextsl),
                name,
                type,
                Number(buaText),
                udsText ? Number(udsText) : 0,
                phoneText ? encryptData(phoneText) : "",
                emailText ? encryptData(emailText) : "",
                excluded ?? false,
                corpExcluded ?? false,
              ],
            );
            await syncExclusions(
              flat,
              excluded ?? false,
              corpExcluded ?? false,
            );
            created++;
            results.push({ row: rowNumber, flat, status: "created" });
            continue;
          }
          if (!existing) {
            results.push({
              row: rowNumber,
              flat,
              status: "skipped",
              message: "Flat does not exist; update mode never creates flats",
            });
            continue;
          }
          if (
            buaText &&
            (!Number.isFinite(Number(buaText)) ||
              Number(buaText) <= 0 ||
              Number(buaText) > 100000)
          )
            throw new Error("Sq Ft (bua) must be greater than 0");
          if (
            udsText &&
            (!Number.isFinite(Number(udsText)) ||
              Number(udsText) < 0 ||
              Number(udsText) > 100000)
          )
            throw new Error("UDS must be a number from 0 to 100000");
          const nextName = name || existing.name || "";
          const nextType = type || existing.type || "";
          const nextBua = buaText ? Number(buaText) : Number(existing.bua);
          const nextUds = udsText ? Number(udsText) : Number(existing.uds);
          await sql.query(
            "UPDATE flats SET name=$2, type=$3, bua=$4, uds=$5, phone=CASE WHEN $6::text IS NULL THEN phone ELSE $6 END, email=CASE WHEN $7::text IS NULL THEN email ELSE $7 END, excluded=COALESCE($8::boolean,excluded), corp_excluded=COALESCE($9::boolean,corp_excluded) WHERE flat=$1",
            [
              flat,
              nextName,
              nextType,
              nextBua,
              nextUds,
              phoneText ? encryptData(phoneText) : null,
              emailText ? encryptData(emailText) : null,
              excluded ?? null,
              corpExcluded ?? null,
            ],
          );
          await syncExclusions(flat, excluded, corpExcluded);
          updated++;
          results.push({ row: rowNumber, flat, status: "updated" });
        } catch (e) {
          results.push({
            row: rowNumber,
            flat: flatLabel || "(blank)",
            status: "error",
            message: e instanceof Error ? e.message : "Invalid row",
          });
        }
      }
      const skipped = results.filter((x) => x.status === "skipped").length;
      const errors = results.filter((x) => x.status === "error").length;
      ctx.audit = {
        target: "bulk-flat-data-import",
        detail: { mode, rows: rows.length, created, updated, skipped, errors },
      };
      return { mode, created, updated, skipped, errors, results };
    },
  },

  saveFlat: {
    role: "admin",
    async run(b, ctx) {
      const f = flatBody(b);
      if (b.create) {
        const [ex] = await sql.query("SELECT 1 AS x FROM flats WHERE flat=$1", [
          f.flat,
        ]);
        if (ex) fail(400, `Flat ${f.flat} already exists`);
        const [settingsRow] = await sql.query(
          "SELECT value FROM settings WHERE key='columns'",
        );
        const configuredTotal = Number(settingsRow?.value?.totalFlats || 0);
        if (configuredTotal > 0) {
          const [{ count }] = await sql.query(
            "SELECT COUNT(*)::int AS count FROM flats",
          );
          if (Number(count) >= configuredTotal)
            fail(
              400,
              `The configured total of ${configuredTotal} flats has been reached`,
            );
        }
      }
      const [before] = await sql.query(
        "SELECT excluded, corp_excluded FROM flats WHERE flat=$1",
        [f.flat],
      );
      const encPhone = f.phone ? encryptData(f.phone) : null;
      const encEmail = f.email ? encryptData(f.email) : null;
      await sql.query(
        `INSERT INTO flats(flat,sl,name,type,bua,uds,phone,email,excluded,corp_excluded) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::text,''),COALESCE($8::text,''),$9,COALESCE($10::boolean,false))
         ON CONFLICT(flat) DO UPDATE SET sl=$2, name=$3, type=$4, bua=$5, uds=$6, phone=COALESCE($7::text, flats.phone), email=COALESCE($8::text, flats.email), excluded=$9, corp_excluded=COALESCE($10::boolean, flats.corp_excluded)`,
        [
          f.flat,
          f.sl,
          f.name,
          f.type,
          f.bua,
          f.uds,
          encPhone,
          encEmail,
          f.excluded,
          f.corpExcluded ?? null,
        ],
      );
      const wasMaint = !!before?.excluded,
        wasCorp = !!before?.corp_excluded;
      const nowCorp = f.corpExcluded ?? wasCorp;
      let appliedTo = null;
      {
        const [latest] = await sql.query(
          "SELECT month, archived, notes, excluded_flats, excluded_expense_flats, excluded_corp_flats FROM months ORDER BY month DESC LIMIT 1",
        );
        if (latest && latest.archived !== true && !latest.notes?.completion) {
          const put = (list: unknown, flat: string, on: boolean) => {
            const rest = (Array.isArray(list) ? (list as string[]) : []).filter(
              (x) => x !== flat,
            );
            return on ? [...rest, flat] : rest;
          };
          await sql.query(
            "UPDATE months SET excluded_flats=$2::jsonb, excluded_expense_flats=$3::jsonb, excluded_corp_flats=$4::jsonb WHERE month=$1",
            [
              latest.month,
              JSON.stringify(put(latest.excluded_flats, f.flat, !!f.excluded)),
              JSON.stringify(
                put(latest.excluded_expense_flats, f.flat, !!f.excluded),
              ),
              JSON.stringify(put(latest.excluded_corp_flats, f.flat, nowCorp)),
            ],
          );
          appliedTo = latest.month;
        }
      }

      ctx.audit = {
        target: f.flat,
        detail: {
          appliedToMonth: appliedTo,
          created: !!b.create,
          sl: f.sl,
          name: f.name,
          type: f.type,
          bua: f.bua,
          uds: f.uds,
          excluded: f.excluded,
          corpExcluded: f.corpExcluded,
          contactSaved: f.phone !== undefined || f.email !== undefined,
        },
      };
    },
  },

  deleteFlat: {
    role: "admin",
    async run(b, ctx) {
      const flat = String(b.flat ?? "").trim();
      if (!flat) fail(400, "Flat number is required");
      if (ctx.me.role === "admin") {
        const [stored] = await sql.query(
          `SELECT value FROM settings WHERE key='columns'`,
        );
        const allowAdminFlatDeletion =
          stored?.value?.allowAdminFlatDeletion !== false;
        if (!allowAdminFlatDeletion)
          fail(403, "Flat deletion is restricted to Super Admin");
      }
      const [existing] = await sql.query(
        "SELECT flat FROM flats WHERE flat=$1",
        [flat],
      );
      if (!existing) fail(404, `Flat ${flat} does not exist`);
      const [{ count: paymentCount }] = await sql.query(
        "SELECT COUNT(*)::int AS count FROM payments WHERE flat=$1",
        [flat],
      );
      await sql.query("DELETE FROM payments WHERE flat=$1", [flat]);
      await sql.query("DELETE FROM flats WHERE flat=$1", [flat]);
      ctx.audit = {
        target: flat,
        detail: { deletedPayments: Number(paymentCount) || 0 },
      };
    },
  },

  clearAllHallBookings: {
    role: "super",
    flag: HALL_BOOKING,
    async run(_b, ctx) {
      const [{ count }] = await sql.query(
        "SELECT COUNT(*)::int AS count FROM hall_bookings",
      );
      await sql.query("DELETE FROM hall_bookings");
      ctx.audit = {
        target: "hall_bookings",
        detail: { cleared: Number(count) || 0 },
      };
      return { ok: true, cleared: Number(count) || 0 };
    },
  },
};
