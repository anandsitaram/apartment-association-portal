import { AUTH, features } from "./flags.js";
import { sql } from "./db.js";
import {
  CONFIGURABLE_FEATURES,
  getFeatureConfig,
  systemFeatureEnabled,
} from "./feature-config.js";
import { DEFAULT_EXPENSE_HEADS } from "./validate.js";
import type { Actor, Row } from "./types";

const pick = (o: Record<string, unknown> | undefined, k: string | null) =>
  o && k != null && k in o ? { [k]: o[k] } : {};

export async function snapshot(me: Actor | null, screen = "", month = "") {
  const featureConfig = await getFeatureConfig();
  const [maintenanceRow] = await sql.query(
    "SELECT value FROM settings WHERE key='maintenance' LIMIT 1",
  );
  const maintenanceMode = maintenanceRow?.value || {
    enabled: false,
    message: "System maintenance in progress. Please try again shortly.",
  };
  if (me?.role === "developer") {
    const [st] = await sql.query(
      `SELECT value FROM settings WHERE key='columns'`,
    );
    return {
      months: [],
      payments: [],
      archive: [],
      flats: [],
      settings: {
        hidden: [],
        custom: [],
        labels: {},
        maintenanceValues: [25],
        expenseValues: [25],
        expenseHeads: DEFAULT_EXPENSE_HEADS,
        paymentSplit: "maint_first",
        dueDay: 0,
        orgName: "",
        orgShort: "",
        billing: null,
        totalFlats: 0,
        ...(st?.value || {}),
      },
      corpusLedger: [],
      tickets: [],
      hallBookings: [],
      gymBookings: [],
      polls: [],
      notificationLogs: [],
      authEnabled: AUTH(),
      features: { ...features(), ...featureConfig },
      featureSystemAvailable: Object.fromEntries(
        CONFIGURABLE_FEATURES.map((key) => [key, systemFeatureEnabled(key)]),
      ),
      residentOnly: false,
      mine: null,
      events: [],
      me: { name: me.username, role: me.role, flat: null },
      maintenanceMode,
    };
  }
  const includeCorpusLedger = screen === "corpus" || !screen;
  const includeArchive = screen === "summary" || !screen;
  const loadBookings = screen === "hall" || !screen;
  const loadGym = screen === "gym" || !screen;
  const loadPolls = screen === "polls" || !screen;
  const loadTickets = screen === "tickets" || !screen;
  const loadEvents = screen === "events" || !screen;
  const loadNotifications = screen === "notifications" || !screen;
  // Months screen only shows one month, so fetch just that month's payments
  const paymentsMonth =
    screen === "months" && /^\d{4}-\d{2}$/.test(month) ? month : "";
  const staff = !!me && ["admin", "super", "superadmin"].includes(me.role);
  const residentOnly = me?.role === "user";

  const [
    months,
    payments,
    st,
    archive,
    flatRows,
    corpusLedger,
    ticketRows,
    bookingRows,
    gymRows,
    pollRows,
    voteRows,
    notificationLogs,
    eventRows,
  ] = await Promise.all([
    sql.query("SELECT * FROM months ORDER BY month"),
    paymentsMonth
      ? sql.query("SELECT * FROM payments WHERE month=$1", [paymentsMonth])
      : sql.query("SELECT * FROM payments"),
    sql.query(`SELECT value FROM settings WHERE key='columns'`),
    includeArchive
      ? sql.query("SELECT month, data FROM month_archive ORDER BY month")
      : Promise.resolve([]),
    sql.query(
      "SELECT flat, block, sl, name, type, bua, uds, phone, email, excluded, corp_excluded FROM flats ORDER BY block, sl, flat",
    ),
    staff && includeCorpusLedger
      ? sql.query(
          "SELECT id, at, month, kind, source, description, amount FROM corpus_ledger ORDER BY at",
        )
      : Promise.resolve([]),
    featureConfig.tickets && me && loadTickets
      ? sql.query(
          "SELECT * FROM tickets WHERE deleted_at IS NULL ORDER BY created_at DESC",
        )
      : Promise.resolve([]),
    featureConfig.hallBooking && loadBookings
      ? sql.query(
          "SELECT * FROM hall_bookings WHERE deleted_at IS NULL AND (status <> 'cancelled' OR created_at > now() - interval '30 days') ORDER BY starts_at",
        )
      : Promise.resolve([]),
    featureConfig.gymBooking && loadGym
      ? sql.query(
          "SELECT * FROM gym_bookings WHERE deleted_at IS NULL AND (status <> 'cancelled' OR created_at > now() - interval '30 days') ORDER BY starts_at",
        )
      : Promise.resolve([]),
    featureConfig.polls && loadPolls
      ? sql.query(
          "SELECT * FROM polls WHERE deleted_at IS NULL ORDER BY created_at DESC",
        )
      : Promise.resolve([]),
    featureConfig.polls && loadPolls
      ? sql.query("SELECT poll_id, flat, option_index FROM poll_votes")
      : Promise.resolve([]),
    staff && loadNotifications
      ? sql.query(
          "SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 100",
        )
      : Promise.resolve([]),
    featureConfig.events && me && loadEvents
      ? sql.query(
          "SELECT id,title,description,location,starts_at,ends_at,created_by,created_at FROM events WHERE deleted_at IS NULL ORDER BY starts_at",
        )
      : Promise.resolve([]),
  ]);

  // Residents may see all flat-wise financial rows on Dashboard/Months only when
  // a Super Admin explicitly enables the setting. The default remains private.
  const residentCanViewAllFlats =
    residentOnly && st?.[0]?.value?.allowUsersViewAllFlats === true;

  const mine = residentOnly ? me?.flat || null : null;
  let flats = flatRows.map((f) => {
    if (staff) return f;
    const { phone, email, name, ...rest } = f;
    // Resident accounts never receive personal contact details or resident names.
    return { ...rest, name: "" };
  });
  let pays = payments,
    arch = archive;
  if (residentOnly && !residentCanViewAllFlats) {
    flats = flats.filter((f) => f.flat === mine);
    pays = pays.filter((p) => p.flat === mine);
    arch = arch.map((a) => ({
      month: a.month,
      data: {
        ...a.data,
        due: pick(a.data.due, mine),
        cdue: pick(a.data.cdue, mine),
        paid: pick(a.data.paid, mine),
        cpaid: pick(a.data.cpaid, mine),
      },
    }));
  }
  let tickets = me ? ticketRows : [];
  if (residentOnly) tickets = tickets.filter((t) => t.flat === mine);

  const hallBookings = me ? bookingRows : [];
  const gymBookings = me ? gymRows : [];

  const myFlat = me ? me.flat || me.username : null;
  const polls = me
    ? pollRows.map((p) => {
        const options: string[] = Array.isArray(p.options) ? p.options : [];
        const votes = voteRows.filter((v) => v.poll_id === p.id);
        const tally = options.map(
          (_, i) => votes.filter((v) => v.option_index === i).length,
        );
        const own = votes.find((v) => v.flat === myFlat);
        return {
          ...p,
          options,
          tally,
          totalVotes: votes.length,
          myVote: own ? own.option_index : null,
        };
      })
    : [];

  return {
    months,
    payments: pays,
    ...(paymentsMonth && { paymentsMonth }),
    archive: arch,
    flats,
    settings: {
      hidden: [],
      custom: [],
      labels: {},
      maintenanceValues: [25],
      expenseValues: [25],
      expenseHeads: DEFAULT_EXPENSE_HEADS,
      paymentSplit: "maint_first",
      dueDay: 0,
      orgName: "",
      orgShort: "",
      billing: null,
      totalFlats: flatRows.length,
      ...(st[0]?.value || {}),
      maintenanceMode: maintenanceMode.enabled,
      maintenanceMessage: maintenanceMode.message,
    },
    corpusLedger: staff && includeCorpusLedger ? corpusLedger : [],
    tickets,
    hallBookings,
    gymBookings,
    polls,
    notificationLogs: staff ? notificationLogs : [],
    authEnabled: AUTH(),
    features: { ...features(), ...featureConfig },
    featureSystemAvailable: Object.fromEntries(
      CONFIGURABLE_FEATURES.map((key) => [key, systemFeatureEnabled(key)]),
    ),
    residentOnly,
    mine,
    events: me ? eventRows : [],
    maintenanceMode,
    me: me && { name: me.username, role: me.role, flat: me.flat || null },
  };
}
