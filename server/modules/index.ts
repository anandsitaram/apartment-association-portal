import type { Action } from "../types";
import { actions as maintenance } from "./maintenance.js";
import { actions as corpus } from "./corpus.js";
import { actions as users } from "./users.js";
import { actions as audit } from "./audit.js";
import { actions as system } from "./system.js";
import { actions as tickets } from "./tickets.js";
import { actions as bookings } from "./bookings.js";
import { actions as polls } from "./polls.js";
import { actions as notifications } from "./notifications.js";
import { actions as events } from "./events.js";

export const actions: Record<string, Action> = {
  ...maintenance,
  ...corpus,
  ...users,
  ...audit,
  ...system,
  ...tickets,
  ...bookings,
  ...polls,
  ...notifications,
  ...events,
};
