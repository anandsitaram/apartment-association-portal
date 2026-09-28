import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import { rm } from "node:fs/promises";
import type { ConnectionState, IncomingMessage } from "./types.js";

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || "auth";
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

let sock: WASocket | null = null;
let state: ConnectionState = "starting";
let currentQr: string | null = null; // data: URL
let connectedPhone: string | undefined;
let onIncoming: ((msg: IncomingMessage) => void) | null = null;

function normalizePhone(jid: string): string {
  // "919876543210@s.whatsapp.net" -> "919876543210"
  return jid.split("@")[0].split(":")[0];
}

export function onIncomingMessage(cb: (msg: IncomingMessage) => void) {
  onIncoming = cb;
}

export function getStatus() {
  return { state, phone: connectedPhone, qr: currentQr ?? undefined };
}

export async function start() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: authState,
    logger: logger.child({ module: "baileys" }),
    printQRInTerminal: false,
    browser: [
      process.env.WHATSAPP_APP_NAME || "Owners Association",
      "Chrome",
      "1.0",
    ],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = await QRCode.toDataURL(qr);
      state = "qr";
      console.log("[whatsapp] scan the QR code: GET /qr");
    }

    if (connection === "open") {
      state = "connected";
      currentQr = null;
      connectedPhone = sock?.user?.id
        ? normalizePhone(sock.user.id)
        : undefined;
      console.log(`[whatsapp] connected as ${connectedPhone}`);
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      currentQr = null;
      if (loggedOut) {
        state = "logged_out";
        console.log(
          "[whatsapp] session logged out — clearing the saved session and starting a fresh pairing",
        );
        try {
          await rm(AUTH_DIR, { recursive: true, force: true });
        } catch (err) {
          console.error("[whatsapp] failed to clear auth dir", err);
        }
        setTimeout(start, 2000); // will present a fresh QR for whichever number scans it
      } else {
        state = "disconnected";
        console.log("[whatsapp] connection closed, reconnecting…");
        setTimeout(start, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" || !onIncoming) return;
    for (const m of messages) {
      if (m.key.fromMe || !m.message) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue; // skip groups/status
      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        "";
      if (!text) continue;
      onIncoming({
        phone: normalizePhone(jid),
        text,
        timestamp: Number(m.messageTimestamp) || Math.floor(Date.now() / 1000),
        messageId: m.key.id || "",
      });
    }
  });
}

function requireConnected(): WASocket {
  if (!sock || state !== "connected") {
    throw new Error(
      `WhatsApp is not connected (state: ${state}). Scan the QR code first.`,
    );
  }
  return sock;
}

export async function sendText(phone: string, message: string) {
  const s = requireConnected();
  await s.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
}

export async function sendDocument(opts: {
  phone: string;
  filename: string;
  base64: string;
  caption?: string;
  mimetype?: string;
}) {
  const s = requireConnected();
  await s.sendMessage(`${opts.phone}@s.whatsapp.net`, {
    document: Buffer.from(opts.base64, "base64"),
    fileName: opts.filename,
    mimetype: opts.mimetype || "application/pdf",
    caption: opts.caption,
  });
}
