# Apartment Maintenance Tracker

Mobile-friendly web app for the apartment owners association. It replaces the Excel tracker
(`Maintenance_Tracker_2026.xlsx`): monthly expenses, per-flat maintenance and Corp Fund,
payments, a detailed summary, and Excel export in the original sheet's format.

**Stack:** React 18 + Vite · one serverless API (`api/app.js` + `server/`) · Neon Postgres · ExcelJS (export) · hosted on Vercel.

---

## 1. Features

- **Sheet-style tabs** (bottom bar): `SUMMARY`, one tab per month (e.g. `Sep 2026`), `+` to add a month, `USERS` (super admin).
- **Month tab** mirrors the Excel Sep 2026 sheet: Expenses block, then the flats table
  (SL, Name, Flat No, Apt Type, Sq Ft, UDS, Maintenance, Corp Fund, Actual Maint Paid, Actual Corp Paid, Mode, Paid Date, Difference) with a TOTAL row.
  Rows are coloured 🟢 fully paid · 🟡 partly paid · 🔴 unpaid.
- **Detailed SUMMARY tab:** totals cards, payments by flat (a column per month, totals, outstanding, Corp Fund due/paid/balance),
  month-by-month expenses (a column per expense item), and Corp Fund accumulation with notes and the final Corp Fund.
- **Flats (admin):** the **FLATS** tab adds, edits and removes flats (SL, Flat No, owner name, type, sq ft, UDS). Changes apply to every month tab and the Summary at once. Flat No cannot be edited after it is added (payments are stored under it). Removing a flat drops it from all tabs and totals but keeps its payment records, which return if the same Flat No is added again.
- **Names:** owner names are stored in the `flats` table and the API only sends them to admins; viewers and viewer-role users never receive them, so the Name column is hidden for them on SUMMARY and month tabs. The **Hide names** button (header) replaces names with `••••` on screen and in the Excel export. Display-only, remembered per device.
- **Export to Excel** on every month tab.
- **Individual logins** with roles (viewer / admin / super admin).
- **Columns (admin):** ⚙ Columns on a month tab or on SUMMARY lets an admin show/hide columns and **rename** them (blank = default name), plus add **custom columns** on month tabs (e.g. Remarks, Receipt No). On SUMMARY this covers the "Payments by flat" table (the monthly columns share one suffix, e.g. "Sep 2026 Paid"). Settings are stored in the database and apply to everyone; custom values are saved per flat per month.
- **Loading:** a spinner is shown while data loads.
- **Deleted months:** deleting a month (super admin) removes its tab and payment entries, but SUMMARY keeps that month's figures as they were at deletion (marked †).
- **Summary export:** ⬇ Excel (the three Summary tables, honouring hidden/renamed columns; names only for admins) and 🖨 Print / PDF (use the browser's "Save as PDF") on the SUMMARY tab.
- **TOOLS tab (admin):** Reminders, Audit log and Backup (see section 3b). Each is behind a feature flag.
- **Mobile view:** SL, Apt Type, Sq Ft, UDS are hidden on small screens; tables scroll sideways.

## 2. Maintenance calculation (per month, radio buttons)

Set in the month's Expenses block. Only the selected option's box is active. Admins see the options; everyone else sees a one-line description of the selected calculation.

| Option                                  | Maintenance per flat                               |
| --------------------------------------- | -------------------------------------------------- |
| Divide total expenses by (no. of flats) | total expenses ÷ N (default N = 25)                |
| Common amount for all owners            | the same ₹ amount for every flat                   |
| Amount per sq ft                        | rate × the flat's sq ft (e.g. ₹2 × 1,202 = ₹2,404) |

**Round off** (applies to any option): None (2 decimals) · Nearest ₹1 · Round up to ₹1 (e.g. 852.25 → 853).

**Corp Fund** per flat = Corp Fund rate × sq ft, rounded to the nearest rupee. The rate (default 0.5) is a box above each month's table: admins can change it, everyone else sees it read-only. It is stored per month, so changing it never alters other months; a new month starts with the previous month's rate.
**Difference** = (maint paid + corp paid) − (maint due + corp due).
**Corp Fund carried forward** (Summary) = running total of (maintenance due − maintenance paid) month by month.

## 3. Feature flags (all OFF by default)

Everything new is behind an environment variable, so you can switch features on **one at a time**: change the variable in Vercel
(Settings → Environment Variables) and redeploy. Values that count as on: `1`, `true`, `on`, `yes`. With no flags set the app behaves exactly as before.

| Flag               | What it does when ON                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_ENABLED`     | Individual logins + roles (viewer / admin / super). Off = simple mode: anyone can view, **Admin login** uses the shared `ADMIN_PASSWORD`.                                               |
| `PUBLIC_VIEW`      | Only with `AUTH_ENABLED`. Anyone can **view** without logging in (no owner names, phone or e-mail); editing still needs a login. Turn OFF to require login even to view.                |
| `VIEWER_VIEW`      | Only with `AUTH_ENABLED`. A viewer-role user linked to a flat (USERS tab) sees only that flat: a "Your account" page and their own row. A viewer with no flat linked sees nothing.      |
| `LOGIN_RATE_LIMIT` | Locks a login for 15 minutes after 5 wrong passwords for the same user + IP (or 20 per IP). A correct password clears the user + IP counter.                                            |
| `AUDIT_LOG`        | Records who changed what (payments with old → new values, months, flats, settings, users, backups, reminders). Super admins read it in TOOLS → Audit log.                               |
| `REMINDERS`        | TOOLS → Reminders: pending dues per flat with WhatsApp / e-mail / copy buttons. Bulk e-mail sending also needs `RESEND_API_KEY` + `MAIL_FROM`.                                          |
| `AUTO_BACKUP`      | A daily job keeps a backup in the database (last 14; `BACKUP_KEEP` changes that). If `RESEND_API_KEY`, `MAIL_FROM` and `BACKUP_EMAIL` are set, the Monday backup is e-mailed as a file. |

**Suggested order for going live with logins**

1. `AUTH_ENABLED=true` + `PUBLIC_VIEW=true` + `LOGIN_RATE_LIMIT=true` → create admin / viewer accounts on the USERS tab. Viewers notice nothing.
2. Add `AUDIT_LOG=true` (and `AUTO_BACKUP=true`). Check TOOLS → Audit log after a few edits.
3. Link each viewer login to their flat (USERS tab) and set `VIEWER_VIEW=true`.
4. When everyone has an account, remove `PUBLIC_VIEW` (or set it to `false`): login is now required to view.

Switching a flag off again restores the previous behaviour immediately after redeploy. `AUTH_ENABLED` can be turned off again too, but tokens from the other mode stop working, so people log in again.

### 3b. Reminders, audit log, backups

- **Reminders:** pick a month; every flat with maintenance + Corp Fund still unpaid is listed. **WhatsApp** opens a ready message (10-digit numbers are treated as +91), **E-mail** opens your mail app, **Copy** copies the text. With mail configured, **Send e-mail to N** sends through [Resend](https://resend.com) to every listed flat that has an address. Nothing is ever sent automatically. Phone and e-mail are edited on the FLATS tab and are only sent to admins.
- **Audit log:** newest first, last 200. Nothing is recorded while the flag is off.
- **Backups:** TOOLS → Backup (super admin) downloads one JSON file (flats, months, payments, column settings, deleted-month figures; no password hashes). The daily job needs the Vercel cron in `vercel.json` (it runs `/api/cron` at 03:17 UTC; set `CRON_SECRET` on Vercel so only Vercel can call it). Restore or copy with `npm run db` (section 6b).

## 4. Roles (only when `AUTH_ENABLED=true`)

| Role        | Can do                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner       | View everything, hide names, export to Excel                                                                                                            |
| Admin       | Owner rights + enter payments, edit expenses/calculation, add months, **Clear amounts** (removes that month's payment amounts; month and expenses stay) |
| Super admin | Admin rights + **Delete month** (month and all its amounts) + **USERS** tab (create users, set role, reset password, delete)                            |

- Passwords are hashed (scrypt); login lasts 30 days; a deleted user loses access immediately. Login is required to view unless `PUBLIC_VIEW` is on.
- Owners see every flat's amounts (view-only, no names) unless `VIEWER_VIEW` is on and their login is linked to a flat.
- Only super admins see the audit log and backups.
- The first super admin is created automatically: username **`admin`**, password = `ADMIN_PASSWORD`.
- The app refuses to delete your own account or remove the last super admin.

## 5. Project layout

```
api/app.js                handler: login, who-is-calling, one call per action (thin)
api/cron.js               daily job endpoint for Vercel Cron (keep-alive + backups)
server/flags.js           all feature flags
server/actions.js         one entry per POST action (role, flag, validation, audit)
server/snapshot.js        what GET returns, shaped for the caller (names, viewer view)
server/validate.js        input checks for months, payments, flats, settings
server/auth.js            password hashing, signed tokens
server/db.js              database driver (Neon or standard pg), schema, RLS, one-time flats seed
server/audit.js           audit log      server/ratelimit.js  login throttling
server/mail.js            Resend e-mail  server/backup.js     dump / restore     server/jobs.js  daily job
server/dbtool.js          helpers for scripts/db-tool.js
server/flats-seed.js      the original 28 flats; copied into the `flats` table once, never read again
scripts/db-tool.js        `npm run db`: backup / restore / copy between databases
src/main.jsx, App.jsx     entry point; state, login, tabs, save wiring
src/api.js                fetch helper for /api/app
src/lib.js                pure helpers: number formatting, maintenance + Corp Fund maths, Excel formulas, Summary data
src/columns.js            column keys, default names, small-screen rules
src/components/           Summary, MonthTab, Expenses, CorpRate, Row, ColumnsPanel, Flats, Users, Login, Tools (Reminders, AuditLog, Backup), Spinner
src/export.js             month export (fills public/template.xlsx)   src/export-summary.js  Summary export
src/style.css             mobile-first styles (+ print rules)
tests/                    vitest: maths, exports, API + flags on in-memory Postgres, the pg (Supabase) driver, db tool
public/template.xlsx      copy of the Sep 2026 sheet used as the export template
vercel.json               the daily cron
vite.config.js            dev-only plugin that runs api/app.js inside `npm run dev` and loads .env.local
.env.example              variables
```

Run the tests with `npm test` (no database needed).

Database tables (created automatically): `months(month, expenses jsonb, divisor, method, value, rounding, corp_rate)`, `month_archive(month, data jsonb, deleted_at)`,
`flats(flat, sl, name, type, bua, uds, phone, email)`, `payments(month, flat, maint, corp, mode, paid_date, extra)`, `settings(key, value)`, `users(username, pass, role, flat)`,
`audit_log`, `login_attempts`, `backups`. The schema version is stored in `settings`; a cold start does no schema work when it matches.

## 6. Environment variables

| Name                          | Purpose                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | Postgres connection string (Neon, Supabase, or any Postgres). `POSTGRES_URL` also works.                                                           |
| `DB_DRIVER`                   | Optional: `neon` or `pg`. Default: `neon` for `*.neon.tech` hosts, `pg` for everything else.                                                       |
| `DB_SSL`, `DB_RLS`            | Optional: `off` disables SSL / row-level security (only for a local database).                                                                     |
| `ADMIN_PASSWORD`              | Password of the first super admin (`admin`); also signs login tokens                                                                               |
| `AUTH_SECRET`                 | Optional. Separate token-signing secret (defaults to `ADMIN_PASSWORD`)                                                                             |
| feature flags                 | `AUTH_ENABLED`, `PUBLIC_VIEW`, `VIEWER_VIEW`, `LOGIN_RATE_LIMIT`, `AUDIT_LOG`, `REMINDERS`, `AUTO_BACKUP` (section 3)                              |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional. E-mail sending (reminders, weekly backup). `MAIL_FROM` example: `Owners Association <no-reply@yourdomain>` (a domain verified in Resend) |
| `BACKUP_EMAIL`, `BACKUP_KEEP` | Optional. Where the Monday backup is e-mailed; how many daily backups to keep (default 14)                                                         |
| `CRON_SECRET`                 | Optional but recommended. Vercel then sends it with the daily job and `/api/cron` refuses anything else                                            |

## 6b. Database: Neon or Supabase

The app runs on **either**. Nothing changes in the app; only `DATABASE_URL` does.

**Supabase (free plan)**

1. supabase.com → New project. Then **Connect** → copy the **pooled** ("Transaction pooler", port 6543) connection string. Use that one on Vercel: serverless functions open many short connections and the direct one is not suited to that.
2. Vercel → Environment Variables → `DATABASE_URL` = that string (with your database password filled in). Redeploy.
3. The app creates its tables on first use and switches on row-level security (no policies) for all of them, so Supabase's public REST API cannot read or write them. The app connects as the database owner, which is unaffected.
4. Free-plan facts to know (checked July 2026, look again before relying on them): about 500 MB database, and **a project is paused after a week without activity**. The daily job in `vercel.json` runs a tiny query every day, which counts as activity. The free plan has no daily backups, which is one reason `AUTO_BACKUP` exists.

**Moving existing data from Neon to Supabase**

```
SOURCE_DATABASE_URL="<neon url>" DATABASE_URL="<supabase url>" npm run db -- copy --yes
```

Copies flats, months, payments, settings, deleted-month figures **and user accounts**, in one transaction on the target. Then switch `DATABASE_URL` on Vercel and redeploy. Keep the Neon database for a few days as a fallback.

**Backup and restore from your computer**

```
npm run db -- backup                       # writes kadamba-lake-view-backup-<date>.json
npm run db -- restore file.json --yes      # replaces the data in DATABASE_URL, all-or-nothing
```

Put the variables in `.env.local` (the script reads it). `backup --users` also saves login accounts (password hashes: keep the file private).

## 7. Run locally

1. `npm install`
2. Create `.env.local` (each variable on its own line, no quotes):
   ```
   DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
   ADMIN_PASSWORD=your-password
   ```
   Get the connection string from the Neon dashboard → Connection Details, or from Supabase (section 6b).
3. `npm run dev` → open `http://localhost:5173`, log in as `admin`.

`npm run dev` serves the front end **and** the API. You do not need the Vercel CLI for local work.
Local runs use the same Neon database as the live site.

## 8. Deploy to Vercel

1. Push the folder to GitHub and import it on vercel.com (Add New → Project). Or deploy from the folder with `npx vercel --prod`
   (first run: `npx vercel login`, then `npx vercel link`).
2. Database: Project → **Storage** → create **Neon Postgres** and connect it (Vercel sets `DATABASE_URL`), **or** use Supabase (section 6b) and set `DATABASE_URL` yourself.
3. Project → **Settings → Environment Variables** → add `ADMIN_PASSWORD` (all environments).
4. **Redeploy** (variables only apply to new deployments).
5. Open the live URL, log in as `admin`, open **USERS**, and create accounts for viewers and admins.

## 9. Excel export

- Button **⬇ Export to Excel** on each month tab → `<Organisation>_<Mon>_<Year>.xlsx`.
- It fills a copy of the Sep 2026 sheet, so title, colours, merged cells, column widths and colour rules match your original.
- Maintenance, Corp Fund, Difference and totals are live formulas (with cached values).
- The template has room for 30 flats; the export stops with a message if you have more.
- Hidden columns are hidden in the file too; custom columns are added after column M, styled like the Paid Date column.
- The template holds 8 expense lines; extra lines are not exported. GYM and Parking rows stay blank.
- If **Hide names** is on, names export as `••••`.

## 10. API (single endpoint `/api/app`)

`GET` returns months, payments, flats, settings, feature flags and the current user (login required unless simple mode or `PUBLIC_VIEW`). `POST` actions:

| Action                                                                                                  | Who          |
| ------------------------------------------------------------------------------------------------------- | ------------ |
| `login`                                                                                                 | anyone       |
| `saveMonth`, `saveCorpRate`, `savePayment`, `saveSettings`, `clearPayments`, `saveFlat`, `deleteFlat`   | admin, super |
| `sendReminders` (needs `REMINDERS` + mail)                                                              | admin, super |
| `deleteMonth`, `listUsers`, `saveUser`, `deleteUser`, `listAudit`, `backup`, `listBackups`, `getBackup` | super        |

Inputs are validated (month format, amounts, modes, dates, flat numbers, e-mail/phone) and refused with a 400 message otherwise.

## 11. Troubleshooting

| Message / symptom                                         | Fix                                                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unexpected token 'i', "import { n"... is not valid JSON` | Only Vite was serving files. Use the current version and run `npm run dev`.                                                                                 |
| `'vercel' is not recognized`                              | The Vercel CLI is not installed. Use `npx vercel ...`. Not needed for local dev.                                                                            |
| `DEV_RECURSIVE_INVOCATION`                                | The `dev` script must be `vite` (it must not call `vercel dev`).                                                                                            |
| `DATABASE_URL is not set`                                 | Put `DATABASE_URL` and `ADMIN_PASSWORD` in `.env.local`, one per line. `vercel env pull` does not return sensitive variables, so copy the string from Neon. |
| `API error (HTTP …)` / `Server error`                     | Check the terminal running `npm run dev`, or Vercel → Logs, for the real database error.                                                                    |
| `Wrong username or password`                              | Use `admin` + `ADMIN_PASSWORD` for the first login. The password is read when the users table is first created.                                             |
| Forgot the super admin password                           | In the Neon SQL editor run `DELETE FROM users;`. The next page load recreates `admin` from `ADMIN_PASSWORD` (other accounts are removed too).               |
| `esbuild` / `npm audit` warnings                          | Safe to ignore for this app.                                                                                                                                |

## 12. Changes made to the Excel workbook

- **Sep 2026:** Corp Fund column = `ROUND(0.5*E,0)` with "(Round off)" in the header; Maintenance = `$C$14/25`;
  an "Other" expense line `ROUNDUP(852.25,0)` = 853.
- **SUMMARY:** May–Aug rows removed from both lower tables; the Sep 2026 rows re-linked and the Corp Fund row rebuilt.
  The top table still has its May–Aug columns (all `#REF!`, because those month sheets were deleted).
- The Sep sheet's original Difference formula compares `J − G` (Corp paid vs Maintenance due); the app uses paid − due instead.

## 13. Known limits / ideas

- With `VIEWER_VIEW` off, viewers see every flat's amounts.
- Reminders are manual by design; there is no scheduled sending.
- The Excel month export is limited to 30 flats.
- No Excel import.
- Clear amounts removes payments only; to zero expenses, edit them and Save.
- Login tokens cannot be revoked individually (deleting the user does revoke access).
