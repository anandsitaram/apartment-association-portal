import { sql } from "./db.js";
import { features as systemFeatures } from "./flags.js";
import type {
  ConfigurableFeature,
  ConfigurableFeatures,
} from "../shared/features";

export const CONFIGURABLE_FEATURES: ConfigurableFeature[] = [
  "tickets",
  "hallBooking",
  "gymBooking",
  "events",
  "polls",
  "notification",
  "reminders",
];

const envDefaults = (): ConfigurableFeatures => {
  const f = systemFeatures();
  return {
    tickets: f.tickets,
    hallBooking: f.hallBooking,
    gymBooking: f.gymBooking,
    events: f.events,
    polls: f.polls,
    notification: f.notification,
    reminders: f.reminders,
  };
};

export async function getFeatureConfig(): Promise<ConfigurableFeatures> {
  const defaults = envDefaults();
  const [row] = await sql.query(
    "SELECT value FROM settings WHERE key='features' LIMIT 1",
  );
  const saved =
    row?.value && typeof row.value === "object"
      ? (row.value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    CONFIGURABLE_FEATURES.map((key) => [
      key,
      defaults[key] &&
        (typeof saved[key] === "boolean" ? saved[key] : defaults[key]),
    ]),
  ) as ConfigurableFeatures;
}

export function systemFeatureEnabled(key: ConfigurableFeature): boolean {
  return Boolean(envDefaults()[key]);
}

export async function featureEnabled(
  key: ConfigurableFeature,
): Promise<boolean> {
  if (!systemFeatureEnabled(key)) return false;
  return (await getFeatureConfig())[key] === true;
}

export const FEATURE_ACTIONS: Record<string, ConfigurableFeature> = {
  createTicket: "tickets",
  updateTicketStatus: "tickets",
  deleteTicket: "tickets",
  createBooking: "hallBooking",
  updateBookingStatus: "hallBooking",
  deleteBooking: "hallBooking",
  clearAllHallBookings: "hallBooking",
  createGymBooking: "gymBooking",
  updateGymBookingStatus: "gymBooking",
  deleteGymBooking: "gymBooking",
  createPoll: "polls",
  votePoll: "polls",
  closePoll: "polls",
  deletePoll: "polls",
  createEvent: "events",
  updateEvent: "events",
  deleteEvent: "events",
  listNotificationLogs: "notification",
  sendNotificationMessage: "notification",
  clearNotificationLogs: "notification",
  sendReminders: "reminders",
};
