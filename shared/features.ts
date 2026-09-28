export const FEATURE_DEFINITIONS = [
  {
    key: "tickets",
    label: "Tickets",
    description: "Delivery, security and maintenance requests.",
  },
  {
    key: "hallBooking",
    label: "Party Hall Booking",
    description: "Resident Party Hall booking and approvals.",
  },
  {
    key: "gymBooking",
    label: "Gym Booking",
    description: "Resident Gym slot booking and approvals.",
  },
  {
    key: "events",
    label: "Events",
    description: "Apartment meetings, social and community events.",
  },
  { key: "polls", label: "Polls", description: "Resident polls and voting." },
  {
    key: "notification",
    label: "Notifications",
    description: "Announcements and notification delivery.",
  },
  {
    key: "reminders",
    label: "Reminders",
    description: "Scheduled maintenance/payment reminders.",
  },
] as const;
export type ConfigurableFeature = (typeof FEATURE_DEFINITIONS)[number]["key"];
export type ConfigurableFeatures = Record<ConfigurableFeature, boolean>;
