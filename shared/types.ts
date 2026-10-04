export type Method = "divide" | "common" | "sqft";
export type Rounding = "none" | "nearest" | "up" | "up50" | "up100";
export type Role =
  "superadmin" | "super" | "admin" | "developer" | "user" | "security";
export type SplitMode = "maint_first" | "corp_first" | "proportional";
export type NotificationChannel = "email" | "sms" | "whatsapp" | "all";

export interface Expense {
  description: string;
  amount: number;
}

export interface Flat {
  flat: string;
  sl: number;
  name: string;
  type: string;
  bua: number;
  uds: number;
  phone?: string;
  email?: string;
  excluded?: boolean;
  corp_excluded?: boolean;
}

export interface User {
  username: string;
  role: Role;
  flat?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface Month {
  month: string;
  archived?: boolean;
  expenses: Expense[];
  /** Expense total currently used for maintenance billing; differs from actual expenses until recalculated. */
  calculated_expense_total?: number | null;
  method: Method;
  value?: number | null;
  divisor?: number | null;
  rounding: Rounding;
  corp_rate?: number | null;
  corp_method?: "sqft" | "common" | null;
  corp_applicable?: boolean | null;
  corp_value?: number | null;
  corp_rounding?: Rounding | null;
  excluded_flats?: string[] | null;
  excluded_expense_flats?: string[] | null;
  excluded_corp_flats?: string[] | null;
  notes?: {
    expenses?: string;
    flats?: string;
    expensesStage?: "expected" | "actual";
    /** Show one combined resident-facing charge while preserving internal Corp Fund accounting. */
    mergeMaintenanceCorp?: boolean;
    /** Prior unpaid dues carried into this month. Combined arrears are stored in maintenance. */
    carryForward?: Record<
      string,
      { maintenance: number; corp: number; combined?: boolean }
    >;
    /** Present after the month-end Complete action; locks edits until undone. */
    completion?: {
      nextMonth: string;
      combined: boolean;
      carriedFlats: number;
      remaining: number;
      completedAt: string;
    };
  } | null;
}

export interface Payment {
  month: string;
  flat: string;
  maint: number;
  corp: number;
  mode: string;
  paid_date: string | null;
  extra?: Record<string, string> | null;
}

export type PerFlat = Record<string, number>;

export interface Frozen {
  expenses: Expense[];
  due: PerFlat;
  cdue: PerFlat;
  paid: PerFlat;
  cpaid: PerFlat;
}

export interface Snap extends Frozen {
  month: string;
}

export interface Archived {
  month: string;
  data: Frozen & { month?: string };
}

export interface CustomColumn {
  id: string;
  name: string;
}

export interface Billing {
  method: Method;
  value: number;
  rounding: Rounding;
  corpRate: number;
  corpMethod?: "sqft" | "common";
  corpValue?: number;
  corpRounding: Rounding;
}

export interface Settings {
  hidden: string[];
  flatHidden?: string[];
  custom: CustomColumn[];
  labels: Record<string, string>;
  maintenanceValues?: number[];
  expenseValues?: number[];
  expenseHeads: string[];
  /** Fixed default amount for a head (e.g. Security is always ₹X), keyed by
   *  the exact head name in `expenseHeads`. A head with no entry here, or an
   *  entry of 0, has no default and starts blank/copied as usual. */
  expenseHeadAmounts?: Record<string, number>;
  paymentSplit: SplitMode;
  dueDay?: number;
  autoReminders?: boolean;
  orgName: string;
  orgShort: string;
  /** Contact email address configured for Contact Us messages. */
  contactEmail?: string;
  /** WhatsApp group name shown for urgent matters. */
  whatsappGroupName?: string;
  whatsappGroupLink?: string;
  billing: Billing | null;
  hallBookingAmount?: number;
  totalFlats?: number;
  serviceContacts?: {
    id: string;
    category: string;
    name: string;
    phone: string;
    notes?: string;
  }[];
  /** Super Admin control: when false, Admin accounts cannot delete users. */
  allowAdminUserDeletion?: boolean;
  /** Super Admin control: when false, Admin accounts cannot delete flats. */
  allowAdminFlatDeletion?: boolean;
  /** Super Admin control: allow resident accounts to view flat-wise financial data for all flats on Dashboard and Months. */
  allowUsersViewAllFlats?: boolean;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  retention?: {
    tickets: number;
    contacts: number;
    audit: number;
    security: number;
  };
}

export interface Me {
  name: string;
  role: Role;
  flat: string | null;
}

export interface LedgerEntry {
  id: number;
  at: string;
  month: string | null;
  kind: "deposit" | "withdrawal" | string;
  source: string;
  description: string;
  amount: number;
}

export interface Features {
  auth: boolean;
  audit: boolean;
  rateLimit: boolean;
  reminders: boolean;
  autoBackup: boolean;
  mail: boolean;
  tickets: boolean;
  hallBooking: boolean;
  gymBooking: boolean;
  polls: boolean;
  events: boolean;
  notification: boolean;
  [k: string]: boolean;
}

export interface Data {
  months: Month[];
  payments: Payment[];
  // set when `payments` holds only this one month (Months screen)
  paymentsMonth?: string;
  archive: Archived[];
  flats: Flat[];
  settings: Settings;
  corpusLedger: LedgerEntry[];
  /** Net deposits minus withdrawals in the Corpus Fund ledger, used for the Dashboard balance without exposing ledger details. */
  corpusLedgerNet?: number;
  tickets: Ticket[];
  hallBookings: HallBooking[];
  gymBookings: GymBooking[];
  polls: Poll[];
  events?: ApartmentEvent[];
  notificationLogs?: NotificationLog[];
  authEnabled: boolean;
  features: Features;
  featureSystemAvailable?: Record<string, boolean>;
  residentOnly?: boolean;
  mine: string | null;
  me: Me | null;
  maintenanceMode?: { enabled: boolean; message: string };
}

export type ActionBody = { action: string } & Record<string, unknown>;

export type TicketCategory = "delivery" | "security" | "maintenance";
export type TicketStatus =
  "open" | "approved" | "in_progress" | "resolved" | "rejected";

export interface Ticket {
  id: number;
  category: TicketCategory;
  title: string;
  description: string;
  flat: string;
  status: TicketStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  note?: string;
}

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface HallBooking {
  id: number;
  flat: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  created_by: string;
  created_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  note?: string;
  booking_amount?: number;
}

export interface GymBooking {
  id: number;
  flat: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  created_by: string;
  created_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  note?: string;
}

export interface Poll {
  id: number;
  title: string;
  description: string;
  options: string[];
  status: "open" | "closed";
  created_by: string;
  created_at: string;
  closes_at?: string | null;
  tally: number[];
  totalVotes: number;
  myVote: number | null;
}

export interface ApartmentEvent {
  id: number;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
}

export interface NotificationLog {
  id: number;
  sent_at: string;
  sent_by: string;
  channel: NotificationChannel;
  target: string;
  subject: string;
  message: string;
  status: "sent" | "failed" | "queued";
}
