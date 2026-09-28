import { useState } from "react";
import { APP_BRAND_NAME } from "../../shared/branding";
import { usePersistentState } from "../usePersistentState.js";
import type { Data, NotificationChannel } from "../../shared/types";
import type { Save } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";

export default function NotificationsPanel({
  data,
  superAdmin,
  onSave,
}: {
  data: Data;
  superAdmin: boolean;
  onSave: Save;
}) {
  const [channel, setChannel] = usePersistentState<NotificationChannel>(
    "rv_notifications_channel",
    "all",
  );
  const [targetType, setTargetType] = usePersistentState<
    "all" | "unpaid" | "flat"
  >("rv_notifications_target_type", "all");
  const [targetFlat, setTargetFlat] = useState(data.flats[0]?.flat || "");
  const [template, setTemplate] = usePersistentState<"reminder" | "custom">(
    "rv_notifications_template",
    "reminder",
  );
  const [subject, setSubject] = useState("Maintenance Payment Reminder");
  const [message, setMessage] = useState(
    "Dear resident, this is a friendly reminder to pay your monthly maintenance dues. Thank you!",
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const logs = data.notificationLogs || [];

  const handleTemplateChange = (t: "reminder" | "custom") => {
    setTemplate(t);
    if (t === "reminder") {
      setSubject("Maintenance Payment Reminder");
      setMessage(
        "Dear resident, this is a friendly reminder to pay your monthly maintenance dues. Thank you!",
      );
    } else {
      setSubject(
        `${data.settings.orgShort || data.settings.orgName || APP_BRAND_NAME} Notice`,
      );
      setMessage("");
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) return;
    if (targetType === "flat" && !targetFlat) {
      setFeedback("Select a flat first");
      setTimeout(() => setFeedback(""), 4000);
      return;
    }
    setBusy(true);
    const ok = await onSave({
      action: "sendNotificationMessage",
      channel,
      targetType,
      targetFlat: targetType === "flat" ? targetFlat : undefined,
      subject: subject.trim(),
      message: message.trim(),
    });

    setBusy(false);
    if (ok) {
      setFeedback("Notification dispatched successfully!");
      if (template === "custom") {
        setMessage("");
      }
      setTimeout(() => setFeedback(""), 4000);
    }
  };

  const clearLogs = async () => {
    if (
      await openConfirm({
        title: "Clear notification logs?",
        message: "All notification delivery logs will be removed.",
        confirmLabel: "Clear logs",
        danger: true,
      })
    ) {
      onSave({ action: "clearNotificationLogs" });
    }
  };

  return (
    <div className="dash">
      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Send Notifications</h2>
            <p>
              Dispatch manual announcements or payment reminders via Email, SMS,
              or WhatsApp.
            </p>
          </div>
        </div>
        <div className="ticket-form">
          <div className="row">
            <b>Channels</b>
            <div className="chips" role="tablist">
              {(
                [
                  { id: "all", label: "All Channels" },
                  { id: "email", label: "Email" },
                  { id: "sms", label: "SMS Message" },
                  { id: "whatsapp", label: "WhatsApp" },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  className={channel === c.id ? "pri" : ""}
                  onClick={() => setChannel(c.id)}
                  type="button"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <b>Target Audience</b>
            <div className="chips">
              <button
                className={targetType === "all" ? "pri" : ""}
                onClick={() => setTargetType("all")}
                type="button"
              >
                All Residents
              </button>
              <button
                className={targetType === "unpaid" ? "pri" : ""}
                onClick={() => setTargetType("unpaid")}
                type="button"
              >
                Unpaid Maintenance Only
              </button>
              <button
                className={targetType === "flat" ? "pri" : ""}
                onClick={() => setTargetType("flat")}
                type="button"
              >
                Specific Flat
              </button>
            </div>
            {targetType === "flat" && (
              <select
                value={targetFlat}
                onChange={(e) => setTargetFlat(e.target.value)}
              >
                {data.flats.map((f) => (
                  <option key={f.flat} value={f.flat}>
                    Flat {f.flat} — {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="row">
            <b>Preset Template</b>
            <div className="chips">
              <button
                className={template === "reminder" ? "pri" : ""}
                onClick={() => handleTemplateChange("reminder")}
                type="button"
              >
                Payment Reminder
              </button>
              <button
                className={template === "custom" ? "pri" : ""}
                onClick={() => handleTemplateChange("custom")}
                type="button"
              >
                Custom Announcement
              </button>
            </div>
          </div>

          <input
            placeholder="Notification Subject / Title"
            autoComplete="off"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <textarea
            placeholder="Notification message body..."
            autoComplete="off"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <div className="row">
            <button
              className="btn-primary"
              disabled={busy || !subject.trim() || !message.trim()}
              onClick={handleSend}
            >
              {busy ? "Sending..." : "📤 Dispatch Notification"}
            </button>
            {feedback && (
              <span
                className={feedback.startsWith("Select") ? "err" : "positive"}
              >
                {feedback}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Notification History</h2>
            <p>Log of sent notifications and delivery status.</p>
          </div>
          {superAdmin && logs.length > 0 && (
            <button className="danger" onClick={clearLogs}>
              Clear History
            </button>
          )}
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Sent By</th>
                <th>Channel</th>
                <th>Target</th>
                <th>Subject</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.sent_at).toLocaleString("en-IN")}</td>
                  <td>{log.sent_by}</td>
                  <td>
                    <span className="badge badge-approved">
                      {log.channel.toUpperCase()}
                    </span>
                  </td>
                  <td>{log.target}</td>
                  <td>{log.subject}</td>
                  <td>{log.message}</td>
                  <td>
                    <span className="badge badge-resolved">{log.status}</span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7}>No notifications sent yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
