import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import {
  start,
  getStatus,
  sendText,
  sendDocument,
  onIncomingMessage,
} from "./whatsapp.js";
import type {
  SendTextBody,
  SendDocumentBody,
  IncomingMessage,
} from "./types.js";

const PORT = Number(process.env.PORT) || 3100;
const TOKEN = process.env.WHATSAPP_SERVICE_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;

if (!TOKEN) {
  console.warn(
    "[whatsapp-service] WHATSAPP_SERVICE_TOKEN is not set — every endpoint is unauthenticated. Set it before deploying.",
  );
}

const app = express();
app.use(express.json({ limit: "15mb" })); // PDF receipts arrive as base64

function auth(req: Request, res: Response, next: NextFunction) {
  if (!TOKEN) return next(); // dev mode only
  const header = req.headers.authorization || "";
  if (header === `Bearer ${TOKEN}`) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// No auth — used by the hosting platform's health check.
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/status", auth, (_req, res) => {
  const { qr, ...rest } = getStatus();
  res.json(rest); // status doesn't leak the QR itself
});

// Human-friendly: open this in a browser and scan with the association phone.
app.get("/qr", auth, (_req, res) => {
  const { state, qr } = getStatus();
  if (state === "connected") {
    return res.send("<h1>Already connected ✅</h1>");
  }
  if (state !== "qr" || !qr) {
    return res
      .status(503)
      .send(
        `<html><head><meta http-equiv="refresh" content="4"></head>` +
          `<body><h1>No QR code available yet (state: ${state})</h1>` +
          `<p>This page refreshes itself every 4 seconds.</p></body></html>`,
      );
  }
  // WhatsApp QR codes expire in ~20s and Baileys issues a new one — auto
  // refresh well inside that window so you're never scanning a stale code.
  res.send(
    `<html><head><meta http-equiv="refresh" content="10"></head>
    <body style="font-family:sans-serif;text-align:center;margin-top:2rem">
      <h2>Scan with WhatsApp on the association phone</h2>
      <img src="${qr}" width="300" height="300" />
      <p>WhatsApp app &rarr; Linked devices &rarr; Link a device</p>
      <p style="color:#888">This page auto-refreshes every 10s so the code stays current.</p>
    </body></html>`,
  );
});

app.post("/send/text", auth, async (req, res) => {
  const b = req.body as SendTextBody;
  if (!b?.phone || !b?.message) {
    return res.status(400).json({ error: "phone and message are required" });
  }
  try {
    await sendText(String(b.phone), String(b.message));
    res.json({ sent: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "send failed" });
  }
});

app.post("/send/document", auth, async (req, res) => {
  const b = req.body as SendDocumentBody;
  if (!b?.phone || !b?.filename || !b?.base64) {
    return res
      .status(400)
      .json({ error: "phone, filename and base64 are required" });
  }
  try {
    await sendDocument({
      phone: String(b.phone),
      filename: String(b.filename),
      base64: String(b.base64),
      caption: b.caption ? String(b.caption) : undefined,
      mimetype: b.mimetype ? String(b.mimetype) : undefined,
    });
    res.json({ sent: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "send failed" });
  }
});

// Convenience wrapper so the main app doesn't have to compose the copy itself.
app.post("/send/booking-confirmation", auth, async (req, res) => {
  const { phone, residentName, facility, date, time, note, orgName } =
    req.body || {};
  if (!phone || !facility || !date) {
    return res
      .status(400)
      .json({ error: "phone, facility and date are required" });
  }
  const message = [
    `Hi ${residentName || "there"}, your booking for *${facility}* is confirmed.`,
    `Date: ${date}${time ? ` at ${time}` : ""}`,
    note ? `Note: ${note}` : null,
    `— ${String(orgName || process.env.ORGANISATION_NAME || "Owners Association")}`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await sendText(String(phone), message);
    res.json({ sent: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "send failed" });
  }
});

async function forwardIncoming(msg: IncomingMessage) {
  if (!WEBHOOK_URL) return; // incoming messages are still logged to the console
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WEBHOOK_TOKEN ? { Authorization: `Bearer ${WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(msg),
    });
  } catch (err) {
    console.error("[whatsapp-service] failed to forward incoming message", err);
  }
}

onIncomingMessage((msg) => {
  console.log(`[whatsapp] incoming from ${msg.phone}: ${msg.text}`);
  void forwardIncoming(msg);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[whatsapp-service] listening on 0.0.0.0:${PORT}`);
});

start().catch((err) => {
  console.error("[whatsapp-service] failed to start", err);
  process.exit(1);
});
