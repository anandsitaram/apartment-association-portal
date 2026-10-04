// E-mail through Resend's HTTP API (https://resend.com). Needs RESEND_API_KEY and MAIL_FROM.
export interface MailAttachment {
  filename: string;
  content: string; // base64
}
export async function sendMail({
  to,
  subject,
  text,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject,
      text,
      ...(attachments && { attachments }),
    }),
  });
  if (!r.ok) throw new Error(`Mail provider answered ${r.status}`);
}
