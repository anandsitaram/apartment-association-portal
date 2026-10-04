import { sendMail } from "./mail.js";
import { ENABLE_NOTIFICATION } from "./flags.js";
import type { NotificationChannel } from "../shared/types";

export interface NotificationRecipient {
  username?: string;
  email?: string;
  phone?: string;
  flat?: string;
}

export interface NotificationPayload {
  type:
    | "ticket_created"
    | "ticket_updated"
    | "booking_created"
    | "booking_updated"
    | "reminder"
    | "announcement";
  subject: string;
  message: string;
  recipient: NotificationRecipient;
  // Which channel(s) to attempt. Defaults to "all" (send on every channel the
  // recipient has contact info for and that is configured).
  channel?: NotificationChannel;
}

export interface NotificationResult {
  emailSent: boolean;
  smsSent: boolean;
  whatsappSent: boolean;
}

// SMS goes out through Twilio's HTTP API (https://www.twilio.com).
// Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (a Twilio
// number capable of SMS).
export const SMS_CONFIGURED = () =>
  !!process.env.TWILIO_ACCOUNT_SID &&
  !!process.env.TWILIO_AUTH_TOKEN &&
  !!process.env.TWILIO_FROM_NUMBER;

async function twilioSend(to: string, from: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString(
    "base64",
  );
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    },
  );
  if (!r.ok) throw new Error(`Twilio answered ${r.status}`);
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (!SMS_CONFIGURED())
    throw new Error(
      "SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
    );
  await twilioSend(to, process.env.TWILIO_FROM_NUMBER!, body);
}

// --- WhatsApp: pluggable providers -----------------------------------
//
// Two providers are available:
//  - "twilio":  Twilio's WhatsApp API. Paid, officially sanctioned, works
//               out of the box on Vercel — no extra hosting needed.
//  - "baileys": a self-hosted service (see whatsapp-service/) using your
//               own WhatsApp number via an unofficial WhatsApp Web client.
//               Free, but needs a separate always-on host — see
//               whatsapp-service/README.md.
//
// Select with WHATSAPP_PROVIDER=twilio|baileys. If unset, Baileys is used
// when WHATSAPP_SERVICE_URL is set, otherwise Twilio.
//
// Adding a future MetaCloudProvider (the official Meta Cloud API) just
// means implementing the same WhatsappProvider interface below — nothing
// outside this file needs to change.

interface WhatsappProvider {
  configured(): boolean;
  send(to: string, body: string): Promise<void>;
  sendDocument(opts: {
    to: string;
    filename: string;
    base64: string;
    caption?: string;
    mimetype?: string;
  }): Promise<void>;
}

const twilioWhatsappProvider: WhatsappProvider = {
  configured: () =>
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER),
  async send(to, body) {
    const from =
      process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER!;
    await twilioSend(
      `whatsapp:${to}`,
      from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      body,
    );
  },
  async sendDocument() {
    // Twilio WhatsApp document sends need a publicly reachable MediaUrl
    // rather than inline base64; not wired up for the first version.
    throw new Error(
      "Document sending via the Twilio WhatsApp provider isn't implemented yet",
    );
  },
};

const baileysWhatsappProvider: WhatsappProvider = {
  configured: () =>
    !!process.env.WHATSAPP_SERVICE_URL && !!process.env.WHATSAPP_SERVICE_TOKEN,
  async send(to, body) {
    await baileysCall("/send/text", { phone: to, message: body });
  },
  async sendDocument(opts) {
    await baileysCall("/send/document", {
      phone: opts.to,
      filename: opts.filename,
      base64: opts.base64,
      caption: opts.caption,
      mimetype: opts.mimetype,
    });
  },
};

async function baileysCall(path: string, body: Record<string, unknown>) {
  const base = process.env.WHATSAPP_SERVICE_URL!;
  const r = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_SERVICE_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(
      `WhatsApp service answered ${r.status}${detail ? `: ${detail}` : ""}`,
    );
  }
}

function whatsappProvider(): WhatsappProvider | null {
  const choice = process.env.WHATSAPP_PROVIDER;
  if (choice === "baileys") return baileysWhatsappProvider;
  if (choice === "twilio") return twilioWhatsappProvider;
  // Auto: prefer baileys if it looks configured, else fall back to twilio.
  if (baileysWhatsappProvider.configured()) return baileysWhatsappProvider;
  return twilioWhatsappProvider;
}

export const WHATSAPP_CONFIGURED = () => {
  const p = whatsappProvider();
  return !!p && p.configured();
};

export async function sendWhatsapp(to: string, body: string): Promise<void> {
  const p = whatsappProvider();
  if (!p || !p.configured())
    throw new Error(
      "WhatsApp is not configured (set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM, " +
        "or WHATSAPP_SERVICE_URL/WHATSAPP_SERVICE_TOKEN for the Baileys service)",
    );
  await p.send(to, body);
}

// For receipts/notices as PDF attachments (currently only the Baileys
// provider implements this — see whatsapp-service/).
export async function sendWhatsappDocument(opts: {
  to: string;
  filename: string;
  base64: string;
  caption?: string;
  mimetype?: string;
}): Promise<void> {
  const p = whatsappProvider();
  if (!p || !p.configured()) throw new Error("WhatsApp is not configured");
  await p.sendDocument(opts);
}

export async function sendNotification(
  payload: NotificationPayload,
): Promise<NotificationResult> {
  let emailSent = false;
  let smsSent = false;
  let whatsappSent = false;

  // Master switch: when ENABLE_NOTIFICATION is false (the default), no
  // notification is ever dispatched on any channel, whether triggered
  // manually from the Notifications tab or automatically (ticket/booking
  // updates, reminders, etc). Callers still get a well-formed "nothing
  // sent" result instead of an error.
  if (!ENABLE_NOTIFICATION()) return { emailSent, smsSent, whatsappSent };

  const channel = payload.channel || "all";
  const wantsEmail = channel === "email" || channel === "all";
  const wantsSms = channel === "sms" || channel === "all";
  const wantsWhatsapp = channel === "whatsapp" || channel === "all";

  if (wantsEmail && payload.recipient.email) {
    try {
      await sendMail({
        to: payload.recipient.email,
        subject: payload.subject,
        text: payload.message,
      });
      emailSent = true;
    } catch (err) {
      console.error(
        "[Notification] Failed to send email to",
        payload.recipient.email,
        err,
      );
    }
  }

  if (wantsSms && payload.recipient.phone && SMS_CONFIGURED()) {
    try {
      await sendSms(
        payload.recipient.phone,
        `${payload.subject}\n\n${payload.message}`,
      );
      smsSent = true;
    } catch (err) {
      console.error(
        "[Notification] Failed to send SMS to",
        payload.recipient.phone,
        err,
      );
    }
  }

  if (wantsWhatsapp && payload.recipient.phone && WHATSAPP_CONFIGURED()) {
    try {
      await sendWhatsapp(
        payload.recipient.phone,
        `${payload.subject}\n\n${payload.message}`,
      );
      whatsappSent = true;
    } catch (err) {
      console.error(
        "[Notification] Failed to send WhatsApp message to",
        payload.recipient.phone,
        err,
      );
    }
  }

  return { emailSent, smsSent, whatsappSent };
}
