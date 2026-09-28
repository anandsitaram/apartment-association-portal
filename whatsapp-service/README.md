# Cedar Grove Residences WhatsApp service

A small standalone Node/TypeScript service that talks to WhatsApp via
[Baileys](https://github.com/WhiskeySockets/Baileys) (an unofficial WhatsApp
Web client) and exposes a plain REST API for the main Cedar Grove Residences app to call.

## Why this is a separate service — read this before deploying

The main app (`api/`, `server/`) runs as **Vercel serverless functions**:
stateless, spun up per-request, no guaranteed local disk between invocations.

Baileys is the opposite of that — it needs:

- a **persistent WebSocket connection** to WhatsApp's servers, kept open
  continuously (not per-request), and
- a **persistent folder on disk** (`auth/`) holding the paired session, so it
  doesn't ask you to re-scan the QR code on every restart.

That means `whatsapp-service` **cannot** live inside `api/` on Vercel. It
needs to run on something with a long-lived process and a persistent disk —
a small VPS, Railway, Render, Fly.io, or similar. Run it under a process
manager (`pm2`, `systemd`, or the platform's own restart policy) so it comes
back up automatically and reconnects.

If you'd rather avoid a second host entirely, `server/notifications.ts` in
the main app still supports the original Twilio-based WhatsApp path — set
`WHATSAPP_PROVIDER=twilio` there instead. Baileys is free and uses your own
WhatsApp number; Twilio is a paid, officially-sanctioned API with none of
these hosting constraints.

## Setup

```bash
cd whatsapp-service
npm install
cp .env.example .env   # fill in WHATSAPP_SERVICE_TOKEN at minimum
npm run dev
```

On first start it has no session, so it prints:

```
[whatsapp] scan the QR code: GET /qr
```

Open `http://localhost:3100/qr` (with `Authorization: Bearer <token>` if you
set one — a browser extension like ModHeader works for this, or just leave
`WHATSAPP_SERVICE_TOKEN` unset while testing locally) on the phone that will
be the association's WhatsApp number: **WhatsApp → Settings → Linked
devices → Link a device**, then scan.

Once linked, the session is saved under `auth/` and survives restarts. Back
that folder up somewhere private — anyone with it can send WhatsApp messages
as your association number.

## API

All endpoints except `/health` require `Authorization: Bearer <WHATSAPP_SERVICE_TOKEN>`.

| Method | Path                         | Body                                                     |
| ------ | ---------------------------- | -------------------------------------------------------- |
| GET    | `/health`                    | —                                                        |
| GET    | `/status`                    | —                                                        |
| GET    | `/qr`                        | — (HTML page with the QR image while pairing)            |
| POST   | `/send/text`                 | `{ phone, message }`                                     |
| POST   | `/send/document`             | `{ phone, filename, base64, caption?, mimetype? }`       |
| POST   | `/send/booking-confirmation` | `{ phone, residentName?, facility, date, time?, note? }` |

`phone` is digits only with country code, e.g. `"919876543210"` — no `+`,
no `whatsapp:` prefix.

Incoming messages (residents replying) are logged to the console and, if
`WEBHOOK_URL` is set, POSTed there as `{ phone, text, timestamp, messageId }`.

## Deploying alongside the main app

```
cedar-grove-app-main/
├── api/, server/, src/     # existing Vercel-deployed app
└── whatsapp-service/       # deploy this separately, e.g. on Railway
```

Point the main app at it via (in the main app's `.env`):

```
WHATSAPP_PROVIDER=baileys
WHATSAPP_SERVICE_URL=https://your-whatsapp-service.up.railway.app
WHATSAPP_SERVICE_TOKEN=the-same-token-you-set-above
```

## Swapping in the official Meta Cloud API later

`server/notifications.ts` in the main app already abstracts the WhatsApp
send behind a provider interface (`TwilioWhatsappProvider` /
`BaileysWhatsappProvider`). Adding a `MetaCloudProvider` there later is a
matter of implementing the same two methods (`send`, `sendDocument`) against
Meta's Graph API — nothing in `server/actions.ts` or the frontend needs to
change.
