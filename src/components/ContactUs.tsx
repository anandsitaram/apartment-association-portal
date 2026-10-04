import { useState } from "react";
import type { Settings } from "../../shared/types";
import type { Save } from "../api.js";

export default function ContactUs({
  settings,
  onSave,
  showWhatsApp,
}: {
  settings: Settings;
  onSave: Save;
  showWhatsApp: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  const contactEmail = String(settings.contactEmail || "").trim();
  const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (!contactEmail) {
      setResult("Contact email has not been configured in Settings yet.");
      return;
    }
    if (!name.trim() || !email.trim() || !message.trim()) {
      setResult("Please enter your name, email address and message.");
      return;
    }
    if (!validEmail) {
      setResult("Please enter a valid email address.");
      return;
    }
    setSending(true);
    setResult("");
    try {
      const ok = await onSave({
        action: "sendContactMessage",
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      if (!ok) {
        setResult(
          "The message could not be sent. Please check the error shown above.",
        );
        return;
      }
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setResult("Your message has been sent successfully.");
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="contact-page">
      <div className="card contact-card">
        <div className="contact-heading">
          <div>
            <h2>CONTACT US</h2>
            <p className="muted">
              If you have any questions, reach out to us at{" "}
              <a href="mailto:aiintechlabs@gmail.com">aiintechlabs@gmail.com</a>. You
              can also send a message using the form below when email
              submissions are configured.
            </p>
          </div>
          <a className="contact-recipient" href="mailto:aiintechlabs@gmail.com">
            aiintechlabs@gmail.com
          </a>
        </div>
        {showWhatsApp &&
          (settings.whatsappGroupName || settings.whatsappGroupLink) && (
            <div className="contact-whatsapp-notice">
              <strong>
                WhatsApp — {settings.whatsappGroupName || "Resident group"}
              </strong>
              <span className="muted">
                For urgent matters, please use the WhatsApp group.
              </span>
              {settings.whatsappGroupLink && (
                <a
                  className="contact-whatsapp-link"
                  href={settings.whatsappGroupLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open WhatsApp group
                </a>
              )}
            </div>
          )}
        {!contactEmail ? (
          <div className="empty-state">
            The contact email address has not been configured in Settings.
          </div>
        ) : (
          <>
            <div className="contact-form-grid">
              <label>
                <span>Name *</span>
                <input
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                <span>Email *</span>
                <input
                  type="email"
                  value={email}
                  maxLength={160}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="contact-wide">
                <span>Subject</span>
                <input
                  value={subject}
                  maxLength={160}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What is this about?"
                />
              </label>
              <label className="contact-wide">
                <span>Message *</span>
                <textarea
                  value={message}
                  maxLength={4000}
                  rows={7}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message here..."
                />
              </label>
            </div>
            <div className="contact-actions">
              <span
                className={
                  result.includes("successfully") ? "success" : "muted"
                }
              >
                {result}
              </span>
              <button
                className="pri"
                type="button"
                disabled={sending}
                onClick={submit}
              >
                {sending ? "Sending…" : "Send message"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
