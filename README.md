# Community Portal — White-label Apartment Association Platform

A white-label, mobile-friendly community management portal for apartment owners associations. This copy uses the fictional **Kadamba Lake View Apartment** brand, a teal theme, an original placeholder building illustration, and fictional demo flat records. All core roles and application features are retained.

Before testing the demo accounts, create a disposable PostgreSQL database and follow [`docs/DEMO_DATA.md`](docs/DEMO_DATA.md). For rebranding instructions, see [`docs/BRANDING.md`](docs/BRANDING.md). Do not use the included public demo credentials for a live association.

**Stack:** React 18 + Vite · one serverless API (`api/app.js` + `server/`) · Neon/Postgres · ExcelJS · Vercel.

---

## 1. Features

- **Sheet-style tabs** (bottom bar): `SUMMARY`, one tab per month (e.g. `Sep 2026`), `+` to add a month, `USERS` (admin).
- **Month tab** mirrors the Excel Sep 2026 sheet: Expenses block, then the flats table
  (SL, Name, Flat No, Apt Type, Sq Ft, UDS, Maintenance, Corp Fund, Actual Maint Paid, Actual Corp Paid, Mode, Paid Date, Difference) with a TOTAL row.
  Rows are coloured 🟢 fully paid · 🟡 partly paid · 🔴 unpaid.
- **Detailed SUMMARY tab:** totals cards, payments by flat (a column per month, totals, outstanding, Corp Fund due/paid/balance),
  month-by-month expenses (a column per expense item), and Corp Fund accumulation with notes and the final Corp Fund.
- **Flats (admin):** the **FLATS** tab adds, edits and removes flats (SL, Flat No, owner name, type, sq ft, UDS). Changes apply to every month tab and the Summary at once. Flat No cannot be edited after it is added (payments are stored under it). Removing a flat drops it from all tabs and totals but keeps its payment records, which return if the same Flat No is added again.
- **Names:** resident names are stored in the `flats` table and the API only sends them to admins; users and user-role users never receive them, so the Name column is hidden for them on SUMMARY and month tabs. The **Hide names** button (header) replaces names with `••••` on screen and in the Excel export. Display-only, remembered per device.
- **Export to Excel** on every month tab. The original payment-template columns are preserved; custom payment fields plus Phone, E-mail and the flat-level **Maintenance Selection** are also exported so the flat master data is complete.
- **Individual logins** with roles (user / admin / super admin), always on.
- **Columns (admin):** ⚙ Columns on a month tab or on SUMMARY lets an admin show/hide columns and **rename** them (blank = default name), plus add **custom columns** on month tabs (e.g. Remarks, Receipt No). On SUMMARY this covers the "Payments by flat" table (the monthly columns share one suffix, e.g. "Sep 2026 Paid"). Settings are stored in the database and apply to everyone; custom values are saved per flat per month.
- **Loading:** a spinner is shown while data loads.
- **Deleted months:** deleting a month (admin) removes its tab and payment entries, but SUMMARY keeps that month's figures as they were at deletion (marked †).
- **Summary export:** ⬇ Excel (the three Summary tables, honouring hidden/renamed columns; names only for admins) and 🖨 Print / PDF (use the browser's "Save as PDF") on the SUMMARY tab.
- **TOOLS tab (admin):** Reminders, Audit log and Backup (see section 3b). Each is behind a feature flag.
- **Mobile view:** SL, Apt Type, Sq Ft, UDS are hidden on small screens; tables scroll sideways.
- **Tickets:** any member can raise a delivery / security / maintenance ticket from the **TICKETS** tab; it's tied to their own flat automatically. The MC (admin/super) approves, moves it to in-progress, resolves or rejects it, with an optional note. Users only ever see their own flat's tickets; the MC sees all of them.
- **My Maintenance (viewer):** a linked viewer gets a **MY MAINTENANCE** tab — their own flat's maintenance + Corp Fund due/paid/status/paid-date for the last 3 or 6 months, plus an outstanding-balance summary. No new data is exposed here beyond what a viewer already sees elsewhere.
- **Corpus fund forecast:** the Corpus Fund page now includes a simple 2-month projection (average net inflow over the last up to 3 recorded months) plus a small trend chart, so the MC can plan ahead. It's a trend estimate, not a guarantee, and is labelled as such.
- **Party hall booking:** the **PARTY HALL** tab is a month calendar — green days have an MC-approved function, amber days have a pending request. Any member can request a date + time slot (up to 24 hours, not in the past); the MC approves or rejects. A request that overlaps an _already-approved_ booking is refused automatically, both when it's requested and if the MC tries to approve a second overlapping one. The requesting flat (or the MC) can cancel a pending/approved booking.
- **Canvas / polls:** the MC can canvass members on a next meeting date or planned activity from the **CANVAS / POLLS** tab — a short question with 2-10 options and an optional closing date. Each flat gets one vote (changeable while the poll is open); results show as a live tally. Individual votes are never sent to other members or to the MC through the API — only the aggregate count and the viewer's own choice.

## 2. Maintenance calculation (per month, radio buttons)

Set in the month's Expenses block. Only the selected option's box is active. Admins see the options; everyone else sees a one-line description of the selected calculation.

| Option                                  | Maintenance per flat                               |
| --------------------------------------- | -------------------------------------------------- |
| Divide total expenses by (no. of flats) | total expenses ÷ N (default N = 25)                |
| Common amount for all residents         | the same ₹ amount for every flat                   |
| Amount per sq ft                        | rate × the flat's sq ft (e.g. ₹2 × 1,202 = ₹2,404) |

**Round off** (applies to any option): None (2 decimals) · Nearest ₹1 · Round up to ₹1 (e.g. 852.25 → 853).

**Corp Fund** per flat = Corp Fund rate × sq ft, rounded to the nearest rupee. The rate (default 0.5) is a box above each month's table: admins can change it, everyone else sees it read-only. It is stored per month, so changing it never alters other months; a new month starts with the previous month's rate.
**Difference** = (maint paid + corp paid) − (maint due + corp due).
**Corp Fund carried forward** (Summary) = running total of (maintenance due − maintenance paid) month by month.

## 2b. Settings, Corp Fund, combined totals (v8)

**Settings tab** now holds all configuration (nothing to configure on the Months tab):

- **Organisation** – full and short name are used as organization metadata for reports, exports and reminders. The pre-login brand and app-shell identity are intentionally fixed in `shared/branding.ts` so they render before settings load.
- **Billing** – maintenance method (divide by number of flats / common amount / per sq ft) with its value, round-off and the **Corp Fund rate**. Saving applies them to the **latest month** and to every month added later; earlier months keep the values they were billed with.
- **Expense heads** – the expense lines (default Bescom, BWSBB, Garbage, Security, Bescom Gym, Diesel). The first month starts with all of them, later months copy the previous month, and _Add from list…_ on a month adds any head that is missing.
- **Actual Total Paid split rule** – maintenance first (default) · Corp Fund first · proportional. Used when a total is typed on a month row and by Bulk fill.
- **Columns** – show / hide / rename for the month tabs or the Summary.

**Flats page** – _Maint. excluded_ and _Corp Fund excluded_ checkboxes (ticked = left out). Saving a flat applies the change to the latest month and to months added afterwards; earlier months keep their own selection. A flat left out has ₹0 maintenance / Corp Fund due in the month table, Dashboard, Summary, Excel export and frozen figures of a deleted month.

**Months tab** – expenses (lines and amounts), payments, and two combined columns: _Expected Total_ and _Actual Total Paid (Maint + Corp Fund)_. Typing a total splits it into Maint. paid and Corp Fund paid (e.g. 2500 → 1900 + 600); both boxes stay editable and the total follows. **Bulk fill** has a _Total paid_ box that does this for every flat from its own dues.

**Corp Fund is admin-only**: users and guests do not get the Corpus Fund page, the Corp Fund columns and cards on Months and Dashboard, or the ledger — the server sends them ₹0 for Corp Fund paid and rate, so the data is not merely hidden. **+ Add month** shows only on the Months page and the names toggle only where names are shown.

**Upgrades** – an existing database is copied into _Backups_ automatically before the schema is upgraded (v10 also aligns each flat's switches with what the latest month used, so calculations do not change). A new installation starts with no flats; set `SEED_FLATS=true` to load the sample roster in `server/flats-seed.js`.

## 2c. Add month: copying from an earlier month (v9)

**+ Add month** (Months tab) opens a dialog instead of creating a blank month outright. It always lets you pick
the month; if any months already exist, it also offers a **Copy from** month (defaults to the latest) and three
independent choices for what to bring over:

- **Expenses** – the previous month's expense _lines_ with amounts reset to ₹0 (default) · the same lines _with_
  its amounts · or don't copy, and start from the expense heads configured in Settings.
- **Calculation** – the method, round-off and Corp Fund rate from Settings → Billing (default) · or exactly as
  billed in the source month.
- **Flats excluded from maintenance / Corp Fund** – as in the source month (default) · or as currently ticked on
  the Flats page.

**Payments are never copied** — every new month starts with nothing paid. The dialog refuses to create a month
that already exists (the server rejects it too, so this can't happen even from two tabs at once).

## 2d. Security

- **Passwords** are stored as salted scrypt hashes, never in plain text; comparisons use a constant-time check so
  a wrong guess can't be timed to learn how much of it was right — this includes the built-in `admin` login,
  which now also gets a constant-time comparison against `ADMIN_PASSWORD`.
- **Changing or removing a login now revokes it immediately.** Previously, a login token stayed valid for up to
  30 days after the password was changed or the account deleted (deletion was already checked on every request;
  password changes were not). A password change now signs that user out of every device the moment it's saved.
- **`LOGIN_RATE_LIMIT` and `AUDIT_LOG` now default to on** (see section 3) — this only changes the default; both
  were already implemented, just off out of the box.
- **Security headers** are set in `vercel.json` for every response: a Content-Security-Policy, HSTS,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a restrictive Permissions-Policy, and
  `Cache-Control: no-store` on `/api/*` so responses (including maintenance figures) are never cached by a shared
  proxy.
- **`/api/cron`** (the daily job) is only protected when `CRON_SECRET` is set — `.env.example` now marks it as
  strongly recommended once `AUTO_BACKUP` or `REMINDERS` are on, since the job can otherwise be triggered by
  anyone who finds the URL.
- Not changed in this pass, and worth knowing: flat phone numbers and e-mail addresses are stored as plain text
  in the database and in backups (visible to admins only in the app itself). Encrypting them at rest would need
  a dedicated key-management story (an `ENCRYPTION_KEY` env var alone is not enough, since it would need
  rotation and the backup/restore and import tools would need to move data between differently-keyed databases)
  — flag it if you want that taken on as its own piece of work.

## 3. Feature flags

### Authentication

Individual logins with roles (**user / admin / super admin**) are always on — no flag needed, nothing to switch on.
Super Admin is the built-in login username **`super-admin`** with the password from `ADMIN_PASSWORD` — it always works and is never stored
in the database or created/edited from the USERS tab (the legacy username `admin` is no longer accepted). A super admin creates User and Admin accounts from the USERS tab; Admin accounts cannot see or manage Super Admin accounts in the USERS tab.

After changing `.env.local`, restart `npm run dev`. On Vercel, environment-variable changes require a new deployment.

Everything else is behind an environment variable, so you can switch features on **one at a time**: change the variable in Vercel
(Settings → Environment Variables) and redeploy. Values that count as on: `1`, `true`, `on`, `yes`.

| Flag                 | What it does                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| legacy `VIEWER`      | Default **on**: the app opens straight to read-only public data, no login required. Set to `false` to show the login screen immediately and require everyone to log in. (`PUBLIC_VIEW` is the old name for this same flag and still works.) |
| legacy `VIEWER_VIEW` | Default **on**: a logged-in viewer linked to a flat (USERS tab) sees only that flat's row. Set to `false` so users instead see every flat's amounts read-only (no names). (`OWNER_VIEW` is the old name and still works.)                   |
| `LOGIN_RATE_LIMIT`   | Default **on**: locks a login for 15 minutes after 5 wrong passwords for the same user + IP (or 20 per IP). A correct password clears the user + IP counter. Set to `false` to turn off.                                                    |
| `AUDIT_LOG`          | Default **on**: records who changed what (payments with old → new values, months, flats, settings, users, backups, reminders). Super admins read it in TOOLS → Audit log. Set to `false` to turn off.                                       |
| `REMINDERS`          | Off by default. TOOLS → Reminders: pending dues per flat with WhatsApp / e-mail / copy buttons. Bulk e-mail sending also needs `RESEND_API_KEY` + `MAIL_FROM`.                                                                              |
| `AUTO_BACKUP`        | Off by default. A daily job keeps a backup in the database (last 14; `BACKUP_KEEP` changes that). If `RESEND_API_KEY`, `MAIL_FROM` and `BACKUP_EMAIL` are set, the Monday backup is e-mailed as a file.                                     |
| `TICKETS`            | Default **on**: the TICKETS tab (delivery/security/maintenance requests + MC approval). Set to `false` to hide it entirely.                                                                                                                 |
| `HALL_BOOKING`       | Default **on**: the PARTY HALL tab (calendar booking with automatic conflict prevention). Set to `false` to hide it.                                                                                                                        |
| `POLLS`              | Default **on**: the CANVAS / POLLS tab. Set to `false` to hide it.                                                                                                                                                                          |

**Getting started**

1. Set `ADMIN_PASSWORD` on Vercel and redeploy. Log in as `super-admin` with that password — you're Super Admin, no other setup needed.
2. Open USERS and create Admin / User accounts for everyone else. Link each User to their flat.
3. `LOGIN_RATE_LIMIT` and `AUDIT_LOG` are already on; optionally also turn on `AUTO_BACKUP` and set `CRON_SECRET`.
4. If you'd rather nobody browse anonymously, set `VIEWER=false`.

### 3b. Reminders, audit log, backups

- **Reminders:** pick a month; every flat with maintenance + Corp Fund still unpaid is listed. **WhatsApp** opens a ready message (10-digit numbers are treated as +91), **E-mail** opens your mail app, **Copy** copies the text. With mail configured, **Send e-mail to N** sends through [Resend](https://resend.com) to every listed flat that has an address. Nothing is ever sent automatically. Phone and e-mail are edited on the FLATS tab and are only sent to admins.
- **Audit log:** newest first, last 200. Nothing is recorded while the flag is off.
- **Backups:** TOOLS → Backup (admin) downloads one JSON file (flats, months, payments, column settings, deleted-month figures; no password hashes). The daily job needs the Vercel cron in `vercel.json` (it runs `/api/cron` at 03:17 UTC; set `CRON_SECRET` on Vercel so only Vercel can call it). Restore or copy with `npm run db` (section 6b).

## 4. Roles

| Role        | Can do                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User        | View everything, hide names, export to Excel; raise tickets, request hall bookings, and vote in polls (own flat only)                                                                                                                              |
| Admin       | User rights + enter payments, edit expenses/calculation, add months, **Clear all amounts** (clears expense amounts and that month's payment amounts; descriptions/settings stay); approve/reject tickets and hall bookings, create and close polls |
| Super admin | Admin rights + **Delete month** (month and all its amounts) + **USERS** tab (create users, set role, reset password, delete) + delete tickets/polls                                                                                                |

- Passwords are hashed (scrypt); login lasts 30 days; a deleted user loses access immediately. Login is required to view unless legacy `VIEWER` is on (the default).
- Users see every flat's amounts (view-only, no names) unless legacy `VIEWER_VIEW` is on (the default) and their login is linked to a flat.
- Only admins see the audit log and backups.
- Super Admin is the built-in `super-admin` login (password = `ADMIN_PASSWORD`) — it's never a row in the `users` table and isn't created or edited from USERS. The legacy username `admin` is no longer accepted; use `super-admin`.
- The app refuses to delete your own account or remove the last admin.

## 5. Project layout

The whole app is TypeScript (`.ts` / `.tsx`); `shared/types.ts` holds the data shapes both the browser and the
server import from. `npm run typecheck` runs `tsc` in strict mode over the app and a looser pass over `tests/`
(tests favour `any` at API boundaries over duplicating every fixture's type). `npm run check` runs that and then
the tests. There is no separate build step for the types — Vite and `tsx` strip them, so a type error is only
ever caught by `typecheck` / your editor, not by `npm run dev`.

```
api/app.ts                 handler: login, who-is-calling, one call per action (thin)
api/cron.ts                daily job endpoint for Vercel Cron (keep-alive + backups)
shared/types.ts             data shapes shared by the browser and the server
server/types.ts             server-only request/action/row types
server/flags.ts             all feature flags
server/actions.ts           one entry per POST action (role, flag, validation, audit)
server/snapshot.ts          what GET returns, shaped for the caller (names, viewer view)
server/validate.ts          input checks for months, payments, flats, settings
server/auth.ts              password hashing, signed tokens, constant-time comparisons
server/db.ts                database driver (Neon or standard pg), schema, RLS, one-time flats seed
server/audit.ts             audit log      server/ratelimit.ts  login throttling
server/mail.ts               Resend e-mail  server/backup.ts     dump / restore     server/jobs.ts  daily job
server/dbtool.ts            helpers for scripts/db-tool.ts
server/flats-seed.ts        sample roster (40 flats: 20 in Block A and 20 in Block C); loaded once into an empty `flats` table only when SEED_FLATS=true
scripts/db-tool.ts          `npm run db`: backup / restore / copy / import-flats
src/main.tsx, App.tsx       entry point; state, login, tabs, save wiring
src/api.ts                  fetch helper for /api/app
src/lib.ts                  pure helpers: number formatting, maintenance + Corp Fund maths, Excel formulas, Summary data, Add month
src/columns.ts               column keys, default names, small-screen rules
src/components/              Summary, MonthTab, NewMonthDialog, Expenses, Row, ColumnsPanel, Flats, Users, Login, Reminders, AuditLog, Backup, Spinner
src/export.ts                month export (fills public/template.xlsx)   src/export-summary.ts  Summary export
src/style.css                mobile-first styles (+ print rules)
tests/                       vitest: maths, exports, API + flags on in-memory Postgres, the pg (Supabase) driver, db tool, DOM interaction (jsdom)
public/template.xlsx        copy of the Sep 2026 sheet used as the export template
vercel.json                  the daily cron + security headers
vite.config.ts               dev-only plugin that runs api/app.ts inside `npm run dev` and loads .env.local
.env.example                 variables
```

Run the tests with `npm test` (no database needed). Type-check with `npm run typecheck`.

Database tables (created automatically): `months(month, expenses jsonb, divisor, method, value, rounding, corp_rate)`, `month_archive(month, data jsonb, deleted_at)`,
`flats(flat, block, sl, name, type, bua, uds, phone, email, excluded, corp_excluded)`, `payments(month, flat, maint, corp, mode, paid_date, extra)`, `settings(key, value)`, `users(username, pass, role, flat, tok_ver)`,
`audit_log`, `login_attempts`, `backups`. The schema version is stored in `settings`; a cold start does no schema work when it matches.

## 6. Environment variables

| Name                          | Purpose                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | Postgres connection string (Neon, Supabase, or any Postgres). `POSTGRES_URL` also works.                                                           |
| `DB_DRIVER`                   | Optional: `neon` or `pg`. Default: `neon` for `*.neon.tech` hosts, `pg` for everything else.                                                       |
| `DB_SSL`, `DB_RLS`            | Optional: `off` disables SSL / row-level security (only for a local database).                                                                     |
| `ADMIN_PASSWORD`              | Password for the built-in Super Admin login (username `super-admin`, no legacy alias); also signs login tokens by default                          |
| `AUTH_SECRET`                 | Optional. Separate token-signing secret (defaults to `ADMIN_PASSWORD`)                                                                             |
| feature flags                 | legacy `VIEWER`, legacy `VIEWER_VIEW`, `LOGIN_RATE_LIMIT`, `AUDIT_LOG`, `REMINDERS`, `AUTO_BACKUP` (section 3)                                     |
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
npm run db -- import-flats public/template.xlsx --yes  # upserts flat master data from the Excel template
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
5. Open the live URL, log in as `admin`, open **USERS**, and create accounts for users and admins.

## 9. Excel export

- Button **⬇ Export to Excel** on each month tab → `<Organisation>_<Mon>_<Year>.xlsx`.
- It fills a copy of the Sep 2026 sheet, so title, colours, merged cells, column widths and colour rules match your original.
- Maintenance, Corp Fund, Difference and totals are live formulas (with cached values).
- The template has room for 30 flats; the export stops with a message if you have more.
- Hidden columns are hidden in the file too; custom columns are added after column M, styled like the Paid Date column.
- The template holds 8 expense lines; extra lines are not exported. GYM and Parking rows stay blank.
- If **Hide names** is on, names export as `••••`.

## 10. API (single endpoint `/api/app`)

`GET` returns months, payments, flats, settings, feature flags and the current user (login required unless legacy `VIEWER` is on, the default). `POST` actions:

| Action                                                                                                                   | Who          |
| ------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `login`                                                                                                                  | anyone       |
| `saveMonth`, `saveCorpRate`, `savePayment`, `saveSettings`, `clearPayments`, `clearAllAmounts`, `saveFlat`, `deleteFlat` | admin, super |
| `sendReminders` (needs `REMINDERS` + mail)                                                                               | admin, super |
| `deleteMonth`, `listUsers`, `saveUser`, `deleteUser`, `listAudit`, `backup`, `listBackups`, `getBackup`                  | super        |

Inputs are validated (month format, amounts, modes, dates, flat numbers, e-mail/phone) and refused with a 400 message otherwise.

## 11. Troubleshooting

| Message / symptom                                         | Fix                                                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unexpected token 'i', "import { n"... is not valid JSON` | Only Vite was serving files. Use the current version and run `npm run dev`.                                                                                 |
| `'vercel' is not recognized`                              | The Vercel CLI is not installed. Use `npx vercel ...`. Not needed for local dev.                                                                            |
| `DEV_RECURSIVE_INVOCATION`                                | The `dev` script must be `vite` (it must not call `vercel dev`).                                                                                            |
| `DATABASE_URL is not set`                                 | Put `DATABASE_URL` and `ADMIN_PASSWORD` in `.env.local`, one per line. `vercel env pull` does not return sensitive variables, so copy the string from Neon. |
| `API error (HTTP …)` / `Server error`                     | Check the terminal running `npm run dev`, or Vercel → Logs, for the real database error.                                                                    |
| `Wrong username or password`                              | Use `super-admin` + `ADMIN_PASSWORD` for the first login — that always works, independent of the database.                                                  |
| Forgot the admin password                                 | Change `ADMIN_PASSWORD` on Vercel and redeploy — the built-in `super-admin` login uses the new value immediately (nothing to reset in the database).        |
| `esbuild` / `npm audit` warnings                          | Safe to ignore for this app.                                                                                                                                |

## 12. Changes made to the Excel workbook

- **Sep 2026:** Corp Fund column = `ROUND(0.5*E,0)` with "(Round off)" in the header; Maintenance = `$C$14/25`;
  an "Other" expense line `ROUNDUP(852.25,0)` = 853.
- **SUMMARY:** May–Aug rows removed from both lower tables; the Sep 2026 rows re-linked and the Corp Fund row rebuilt.
  The top table still has its May–Aug columns (all `#REF!`, because those month sheets were deleted).
- The Sep sheet's original Difference formula compares `J − G` (Corp paid vs Maintenance due); the app uses paid − due instead.

## 13. Known limits / ideas

- With legacy `VIEWER_VIEW` off, users see every flat's amounts.
- Reminders are manual by design; there is no scheduled sending.
- The Excel month export is limited to 30 flats.
- No Excel import.
- Clear all amounts clears the month's expense amounts and payment amounts; expense descriptions, calculation settings, flat selections and Corp Fund rate remain unchanged.
- Login tokens cannot be revoked individually mid-expiry (deleting the user, or changing their password, does revoke access — everything else stays valid for up to 30 days).

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the feature-based frontend structure, backend action modules, shared UI rules, loading/error contract, and financial-year convention.

## Flat data import template

The in-app flat-data template and `docs/templates/kadamba-lake-view-flat-data-template-with-demo-data.xlsx` include 40 fictional sample flat records: 20 in Block A and 20 in Block C. **Replace or delete these sample rows before importing into a real apartment database.** The rows use fictional names, `example.com` email placeholders, and blank phone numbers.
