# Notifications — feature flag & future integration steps

## What changed

The whole Notifications feature (sidebar nav item, `NotificationsPanel`, and
every automatic notification the app fires on ticket/booking updates,
reminders, etc.) is now behind a single environment variable:

```
ENABLE_NOTIFICATION=true   # default: off
```

Values that count as "on": `1`, `true`, `on`, `yes` (case-insensitive).
Anything else — or leaving it unset — is "off".

### What "off" (the default) means

- **Sidebar:** the "Notifications" nav item is filtered out of `NAV` for
  every role (`src/App.tsx`, same mechanism already used for `tickets`,
  `hallBooking`, `gymBooking`, `polls`).
- **Direct navigation:** even if `section` is set to `"notifications"` some
  other way (deep link, stale state), `App.tsx` also checks
  `data.features.notification` before rendering `NotificationsPanel`, so the
  panel never mounts while the flag is off.
- **Server actions:** `sendNotificationMessage` and `clearNotificationLogs`
  (`server/actions.ts`) return `403 "Notifications feature is disabled"` if
  called directly while the flag is off.
- **Every send path:** `sendNotification()` in `server/notifications.ts` is
  the single choke point used by both the manual "Send" button and every
  automatic trigger (ticket created/updated, booking created/updated,
  reminders — see the `sendNotification(...)` call sites in
  `server/actions.ts`). It now short-circuits to `{ emailSent: false,
smsSent: false, whatsappSent: false }` when the flag is off, so **no**
  channel (email / SMS / WhatsApp) ever fires while disabled — nothing to
  individually toggle off elsewhere.

### Where the flag lives

- `server/flags.ts` — `ENABLE_NOTIFICATION()` + added to the `features()`
  object as `notification`.
- `shared/types.ts` — `Features.notification: boolean` (the type already had
  a `[k: string]: boolean` index signature, so this is purely documentation/
  type-safety, not a breaking change).
- `.env.example` — documented next to the other Notifications-tab variables.

## Turning it on

1. Set `ENABLE_NOTIFICATION=true` in `.env.local` (dev) or the platform's
   environment variables (Vercel: Settings → Environment Variables), then
   redeploy / restart `npm run dev`.
2. Configure at least one channel so sends actually go out:
   - **Email:** `RESEND_API_KEY` + `MAIL_FROM`.
   - **SMS:** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`.
   - **WhatsApp:** either Twilio (`TWILIO_WHATSAPP_FROM`, or falls back to
     `TWILIO_FROM_NUMBER`) or the self-hosted Baileys service in
     `whatsapp-service/` (`WHATSAPP_SERVICE_URL` + `WHATSAPP_SERVICE_TOKEN`).
     See `whatsapp-service/README.md` for hosting notes.
3. With no channel configured, the flag being on just means the tab is
   visible and logs get written with `status: "failed"` — no crashes.

## Future integration steps (when the flag is turned on for real)

These are the steps for whoever picks this up next, in the order that gives
the smallest blast radius:

1. **Pick a channel to pilot first.** Email via Resend is the least
   operationally heavy (no phone number, no session to keep alive) — good
   for validating the end-to-end flow (`sendNotificationMessage` action →
   `notification_logs` table → `NotificationsPanel` history) before adding
   SMS/WhatsApp.
2. **SMS/WhatsApp via Twilio** if a paid, officially-sanctioned API is
   acceptable — no extra hosting, just the three/four Twilio env vars above.
3. **WhatsApp via Baileys** (`whatsapp-service/`) if a free, self-hosted
   option using the association's own WhatsApp number is preferred. Needs a
   long-lived host (small VPS / Railway / Render / Fly.io) — it cannot run
   as a Vercel serverless function because it keeps a persistent WebSocket
   - a persisted `auth/` session folder. See that folder's README for the
     full pairing walkthrough.
4. **Meta Cloud API (official WhatsApp Business API)**, if/when preferred
   over Baileys: `server/notifications.ts` already abstracts sends behind a
   `WhatsappProvider` interface (`configured()`, `send()`,
   `sendDocument()`). Add a `metaCloudWhatsappProvider` implementing that
   interface and wire it into `whatsappProvider()`'s provider selection —
   nothing in `server/actions.ts` or the frontend needs to change.
5. **Re-test the disabled path** after wiring a new provider: with
   `ENABLE_NOTIFICATION` unset/false, confirm the new provider is still never
   called (it shouldn't be, since the short-circuit lives in
   `sendNotification()` itself, above all provider-specific code) and that
   the sidebar item stays hidden.
6. **Rollout:** flip `ENABLE_NOTIFICATION=true` on staging first, send a
   test announcement to a single flat (`targetType: "flat"`), check
   `notification_logs` and the real channel before enabling broadly.
