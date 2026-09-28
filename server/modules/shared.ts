import { sql } from "../db.js";

export const admins = async () =>
  (
    await sql.query(
      "SELECT count(*)::int AS n FROM users WHERE role IN ('admin', 'super', 'superadmin')",
    )
  )[0].n;

export const logAutoNotification = async (
  target: string,
  subject: string,
  message: string,
  sent: boolean,
) => {
  try {
    await sql.query(
      `INSERT INTO notification_logs(sent_by,channel,target,subject,message,status) VALUES('system','all',$1,$2,$3,$4)`,
      [target, subject, message, sent ? "sent" : "failed"],
    );
  } catch (err) {
    console.error("[Notification] Failed to record notification log", err);
  }
};
