export type ConnectionState =
  | "starting"
  | "qr" // a QR code is waiting to be scanned
  | "connected"
  | "disconnected"
  | "logged_out";

export interface StatusResponse {
  state: ConnectionState;
  phone?: string; // the association number, once connected
  qr?: string; // data: URL (PNG) — only present while state === "qr"
}

export interface SendTextBody {
  phone: string; // "919876543210" — country code, no "+", no "whatsapp:" prefix
  message: string;
}

export interface SendDocumentBody {
  phone: string;
  filename: string; // e.g. "receipt-oct-2026-B302.pdf"
  base64: string; // raw base64 of the file (no data: prefix)
  caption?: string;
  mimetype?: string; // defaults to application/pdf
}

export interface IncomingMessage {
  phone: string; // sender, normalized (no "+", no "@s.whatsapp.net")
  text: string;
  timestamp: number; // unix seconds
  messageId: string;
}
