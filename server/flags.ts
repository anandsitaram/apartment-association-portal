const truthy = (v?: string) => /^(1|true|on|yes)$/i.test(v || "");
const on = (name: string) => truthy(process.env[name]);
const onByDefault = (...names: string[]) => {
  for (const name of names) {
    const v = process.env[name];
    if (v != null && v !== "") return truthy(v);
  }
  return true;
};

export const AUTH = () => true;
export const AUDIT_LOG = () => onByDefault("AUDIT_LOG");
export const LOGIN_RATE_LIMIT = () => onByDefault("LOGIN_RATE_LIMIT");
export const REMINDERS = () => on("REMINDERS");
export const AUTO_BACKUP = () => on("AUTO_BACKUP");
export const MAIL = () =>
  !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
export const TICKETS = () => onByDefault("TICKETS");
export const HALL_BOOKING = () => onByDefault("HALL_BOOKING");
export const GYM_BOOKING = () => onByDefault("GYM_BOOKING");
export const POLLS = () => onByDefault("POLLS");
export const EVENTS = () => onByDefault("EVENTS");
// Master switch for the Notifications feature (sidebar nav item, panel,
// WhatsApp/other delivery). Defaults to OFF unless ENABLE_NOTIFICATION is
// explicitly set to a truthy value (1/true/on/yes).
export const ENABLE_NOTIFICATION = () => on("ENABLE_NOTIFICATION");

export const features = () => ({
  auth: AUTH(),
  publicView: false,
  audit: AUDIT_LOG(),
  rateLimit: LOGIN_RATE_LIMIT(),
  reminders: REMINDERS(),
  autoBackup: AUTO_BACKUP(),
  mail: MAIL(),
  tickets: TICKETS(),
  hallBooking: HALL_BOOKING(),
  gymBooking: GYM_BOOKING(),
  polls: POLLS(),
  events: EVENTS(),
  notification: ENABLE_NOTIFICATION(),
});
