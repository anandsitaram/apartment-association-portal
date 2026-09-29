import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "test";
process.env.SEED_FLATS = "true";
process.env.DB_DRIVER = "neon"; // replaced by an in-memory Postgres (tests/neon-shim.js)
process.env.ADMIN_PASSWORD = "adminpw1";

let handler: any,
  admin: any,
  superToken: any,
  viewerToken: any,
  plainAdminToken: any;
async function call(method: string, body?: any, token?: any) {
  const out: { code?: number; body?: any } = {};
  const res = {
    setHeader() {},
    status(c: number) {
      out.code = c;
      return res;
    },
    json(o: any) {
      out.body = o;
      out.code ||= 200;
    },
  };
  await handler(
    {
      method,
      body,
      headers: token ? { authorization: "Bearer " + token } : {},
    },
    res,
  );
  return out;
}
const post = (body?: any, token: any = admin) => call("POST", body, token);
const get = (token: any = admin) => call("GET", undefined, token);

beforeAll(async () => {
  handler = (await import("../api/app.js")).default;
  // Only "super-admin" exists out of the box (via ADMIN_PASSWORD); create the
  // "admin" account these tests run as, the same way a real deployment would.
  superToken = (
    await call("POST", {
      action: "login",
      username: "super-admin",
      password: "adminpw1",
    })
  ).body.token;
  await call(
    "POST",
    {
      action: "saveUser",
      username: "admin",
      password: "adminpw1",
      role: "admin",
    },
    superToken,
  );
  admin = (
    await call("POST", {
      action: "login",
      username: "admin",
      password: "adminpw1",
    })
  ).body.token;
  await post({
    action: "saveUser",
    username: "flat101",
    password: "viewer1234",
    role: "user",
    flat: "101-3BHK",
  });
  viewerToken = (
    await call("POST", {
      action: "login",
      username: "flat101",
      password: "viewer1234",
    })
  ).body.token;
  await post({
    action: "saveUser",
    username: "plainadmin",
    password: "adminpw1234",
    role: "admin",
  });
  plainAdminToken = (
    await call("POST", {
      action: "login",
      username: "plainadmin",
      password: "adminpw1234",
    })
  ).body.token;
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  vi.unstubAllGlobals();
});

describe("tickets", () => {
  it("a member can raise a ticket tied to their own flat; the MC (admin) can approve it", async () => {
    const r = await post(
      {
        action: "createTicket",
        category: "security",
        title: "Broken gate light",
      },
      viewerToken,
    );
    expect(r.body.ok).toBe(true);
    const [t] = (await get(admin)).body.tickets;
    expect(t).toMatchObject({
      flat: "101-3BHK",
      category: "security",
      status: "open",
    });
    const approve = await post(
      { action: "updateTicketStatus", id: t.id, status: "approved" },
      admin,
    );
    expect(approve.body.ok).toBe(true);
    expect((await get(admin)).body.tickets[0].status).toBe("approved");
  });

  it("a viewer cannot approve tickets and only ever sees their own flat's tickets", async () => {
    const denied = await post(
      { action: "updateTicketStatus", id: 1, status: "approved" },
      viewerToken,
    );
    expect(denied.code).toBe(403);
    const mine = (await get(viewerToken)).body.tickets;
    expect(mine.every((t: any) => t.flat === "101-3BHK")).toBe(true);
  });

  it("an anonymous/guest request cannot raise a ticket", async () => {
    const r = await post(
      { action: "createTicket", category: "delivery", title: "Parcel" },
      null,
    );
    expect(r.code).toBe(401);
  });
});

describe("hall booking", () => {
  it("blocks a new request that overlaps an already-approved booking", async () => {
    const first = await post(
      {
        action: "createBooking",
        title: "Birthday",
        startsAt: "2027-01-10T12:00:00.000Z",
        endsAt: "2027-01-10T15:00:00.000Z",
      },
      viewerToken,
    );
    expect(first.body.ok).toBe(true);
    const [b] = (await get(admin)).body.hallBookings;
    await post(
      { action: "updateBookingStatus", id: b.id, status: "approved" },
      admin,
    );

    const overlapping = await post(
      {
        action: "createBooking",
        title: "Anniversary",
        startsAt: "2027-01-10T14:00:00.000Z",
        endsAt: "2027-01-10T18:00:00.000Z",
      },
      viewerToken,
    );
    expect(overlapping.code).toBe(409);

    const nonOverlapping = await post(
      {
        action: "createBooking",
        title: "Housewarming",
        startsAt: "2027-01-11T12:00:00.000Z",
        endsAt: "2027-01-11T15:00:00.000Z",
      },
      viewerToken,
    );
    expect(nonOverlapping.body.ok).toBe(true);
  });

  it("refuses to approve a second booking that overlaps an already-approved one", async () => {
    const pending = (await get(admin)).body.hallBookings.find(
      (x: any) => x.title === "Housewarming",
    );
    const clash = await post(
      {
        action: "createBooking",
        title: "Clashing request",
        startsAt: "2027-01-11T13:00:00.000Z",
        endsAt: "2027-01-11T16:00:00.000Z",
      },
      viewerToken,
    );
    // this one doesn't overlap an *approved* booking yet, so it's accepted as pending
    expect(clash.body.ok).toBe(true);
    const clashRow = (await get(admin)).body.hallBookings.find(
      (x: any) => x.title === "Clashing request",
    );
    await post(
      { action: "updateBookingStatus", id: pending.id, status: "approved" },
      admin,
    );
    const approveClash = await post(
      { action: "updateBookingStatus", id: clashRow.id, status: "approved" },
      admin,
    );
    expect(approveClash.code).toBe(409);
  });

  it("lets the requesting flat cancel their own booking but not someone else's", async () => {
    const mine = (await get(viewerToken)).body.hallBookings.find(
      (x: any) => x.title === "Birthday",
    );
    const cancel = await post(
      { action: "cancelBooking", id: mine.id },
      viewerToken,
    );
    expect(cancel.body.ok).toBe(true);
    expect(
      (await get(admin)).body.hallBookings.find((x: any) => x.id === mine.id)
        .status,
    ).toBe("cancelled");
  });
});

describe("polls / canvas", () => {
  it("tallies votes without exposing who voted what to a member", async () => {
    const created = await post(
      {
        action: "createPoll",
        title: "Best date for the AGM?",
        options: ["Sat 10 Jan", "Sun 11 Jan"],
      },
      admin,
    );
    expect(created.body.ok).toBe(true);
    const [poll] = (await get(admin)).body.polls;
    await post(
      { action: "votePoll", pollId: poll.id, optionIndex: 1 },
      viewerToken,
    );
    const asViewer = (await get(viewerToken)).body.polls[0];
    expect(asViewer.tally).toEqual([0, 1]);
    expect(asViewer.totalVotes).toBe(1);
    expect(asViewer.myVote).toBe(1);
    expect(asViewer).not.toHaveProperty("votes");

    await post({ action: "closePoll", id: poll.id }, admin);
    const closedVote = await post(
      { action: "votePoll", pollId: poll.id, optionIndex: 0 },
      viewerToken,
    );
    expect(closedVote.code).toBe(400);
  });
});

describe("gym booking", () => {
  it("blocks a new request that overlaps an already-approved gym session", async () => {
    const first = await post(
      {
        action: "createGymBooking",
        title: "Morning cardio",
        startsAt: "2027-02-10T06:00:00.000Z",
        endsAt: "2027-02-10T07:00:00.000Z",
      },
      viewerToken,
    );
    expect(first.body.ok).toBe(true);
    const [b] = (await get(admin)).body.gymBookings;
    await post(
      { action: "updateGymBookingStatus", id: b.id, status: "approved" },
      admin,
    );

    const overlapping = await post(
      {
        action: "createGymBooking",
        title: "Yoga",
        startsAt: "2027-02-10T06:30:00.000Z",
        endsAt: "2027-02-10T07:30:00.000Z",
      },
      viewerToken,
    );
    expect(overlapping.code).toBe(409);

    const nonOverlapping = await post(
      {
        action: "createGymBooking",
        title: "Evening strength",
        startsAt: "2027-02-10T18:00:00.000Z",
        endsAt: "2027-02-10T19:00:00.000Z",
      },
      viewerToken,
    );
    expect(nonOverlapping.body.ok).toBe(true);
  });

  it("refuses to approve a second gym session that overlaps an already-approved one", async () => {
    const pending = (await get(admin)).body.gymBookings.find(
      (x: any) => x.title === "Evening strength",
    );
    const clash = await post(
      {
        action: "createGymBooking",
        title: "Clashing session",
        startsAt: "2027-02-10T18:30:00.000Z",
        endsAt: "2027-02-10T19:30:00.000Z",
      },
      viewerToken,
    );
    expect(clash.body.ok).toBe(true);
    const clashRow = (await get(admin)).body.gymBookings.find(
      (x: any) => x.title === "Clashing session",
    );
    await post(
      { action: "updateGymBookingStatus", id: pending.id, status: "approved" },
      admin,
    );
    const approveClash = await post(
      {
        action: "updateGymBookingStatus",
        id: clashRow.id,
        status: "approved",
      },
      admin,
    );
    expect(approveClash.code).toBe(409);
  });

  it("lets the requesting flat cancel their own gym booking but not someone else's", async () => {
    const mine = (await get(viewerToken)).body.gymBookings.find(
      (x: any) => x.title === "Morning cardio",
    );
    const cancel = await post(
      { action: "cancelGymBooking", id: mine.id },
      viewerToken,
    );
    expect(cancel.body.ok).toBe(true);
    expect(
      (await get(admin)).body.gymBookings.find((x: any) => x.id === mine.id)
        .status,
    ).toBe("cancelled");
  });
});

describe("super admin identity", () => {
  it('only the built-in "super-admin" username reaches Super Admin; the old "admin" alias is intentionally no longer accepted', async () => {
    const viaNewName = await call("POST", {
      action: "login",
      username: "super-admin",
      password: "adminpw1",
    });
    expect(viaNewName.body.user).toMatchObject({
      name: "super-admin",
      role: "superadmin",
    });

    // "admin" is now an ordinary admin-role account (created in beforeAll),
    // not an alias for the built-in Super Admin login.
    const viaPlainAdminAccount = await call("POST", {
      action: "login",
      username: "admin",
      password: "adminpw1",
    });
    expect(viaPlainAdminAccount.body.user).toMatchObject({
      name: "admin",
      role: "admin",
    });
  });
});

describe("super admin only actions", () => {
  it("only a super admin can delete a ticket", async () => {
    const created = await post(
      { action: "createTicket", category: "maintenance", title: "Leaky tap" },
      viewerToken,
    );
    expect(created.body.ok).toBe(true);
    const ticket = (await get(admin)).body.tickets.find(
      (t: any) => t.title === "Leaky tap",
    );
    const deniedForPlainAdmin = await post(
      { action: "deleteTicket", id: ticket.id },
      plainAdminToken,
    );
    expect(deniedForPlainAdmin.code).toBe(403);
    const deniedForFlatUser = await post(
      { action: "deleteTicket", id: ticket.id },
      viewerToken,
    );
    expect(deniedForFlatUser.code).toBe(403);
    const allowed = await post(
      { action: "deleteTicket", id: ticket.id },
      superToken,
    );
    expect(allowed.body.ok).toBe(true);
    expect(
      (await get(admin)).body.tickets.some((t: any) => t.id === ticket.id),
    ).toBe(false);
  });

  it("only a super admin can clear the audit log", async () => {
    const deniedForPlainAdmin = await post(
      { action: "clearAuditLog" },
      plainAdminToken,
    );
    expect(deniedForPlainAdmin.code).toBe(403);
    const allowed = await post({ action: "clearAuditLog" }, superToken);
    expect(allowed.body.ok).toBe(true);
    // clearing the log is itself an audited action, so exactly one entry
    // (the clear itself) remains right after.
    const entries = (
      await post({ action: "listAudit", limit: 200 }, superToken)
    ).body.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "clearAuditLog" });
  });
});

describe("notifications hub", () => {
  const setFlatEmail = async (flatCode: string, email: string) => {
    const f = (await get(admin)).body.flats.find(
      (x: any) => x.flat === flatCode,
    );
    await post(
      {
        action: "saveFlat",
        flat: flatCode,
        sl: f.sl,
        name: f.name,
        type: f.type,
        bua: f.bua,
        uds: f.uds,
        email,
      },
      admin,
    );
  };

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM =
      "Kadamba Lake View Apartment <no-reply@example.com>";
    process.env.ENABLE_NOTIFICATION = "true";
    await setFlatEmail("101-3BHK", "flat101@example.com");
    await setFlatEmail("102-2BHK", "flat102@example.com");
  });

  it("a flat user cannot send a notification", async () => {
    const r = await post(
      {
        action: "sendNotificationMessage",
        channel: "email",
        targetType: "all",
        subject: "x",
        message: "y",
      },
      viewerToken,
    );
    expect(r.code).toBe(403);
  });

  it("dispatches a custom announcement to all residents and logs it in history", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await post(
      {
        action: "sendNotificationMessage",
        channel: "email",
        targetType: "all",
        subject: "Society meeting",
        message: "AGM this Sunday at 6pm.",
      },
      admin,
    );
    expect(r.body.ok).toBe(true);
    expect(r.body.sentCount).toBeGreaterThan(0);
    const logs = (await get(admin)).body.notificationLogs;
    const entry = logs.find((l: any) => l.subject === "Society meeting");
    expect(entry).toMatchObject({
      target: "All Residents",
      channel: "email",
      status: "sent",
    });
  });

  it("targets a single flat by code, and rejects an unknown one", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await post(
      {
        action: "sendNotificationMessage",
        channel: "email",
        targetType: "flat",
        targetFlat: "101-3BHK",
        subject: "Personal notice",
        message: "Please collect your parcel.",
      },
      admin,
    );
    expect(r.body.ok).toBe(true);
    expect(r.body.target).toBe("Flat 101-3BHK");

    const unknown = await post(
      {
        action: "sendNotificationMessage",
        channel: "email",
        targetType: "flat",
        targetFlat: "999-ZZZ",
        subject: "x",
        message: "y",
      },
      admin,
    );
    expect(unknown.code).toBe(404);
  });

  it("targets only flats that still owe maintenance for the latest month", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await post(
      {
        action: "saveMonth",
        month: "2027-04",
        create: true,
        expenses: [{ description: "Bescom", amount: 25000 }],
      },
      admin,
    );
    // Fully settle 101-3BHK so it should drop out of the "unpaid" list.
    await post(
      {
        action: "savePayment",
        month: "2027-04",
        flat: "101-3BHK",
        maint: 999999,
        corp: 999999,
        mode: "upi",
        date: "2027-04-05",
      },
      admin,
    );
    const r = await post(
      {
        action: "sendNotificationMessage",
        channel: "email",
        targetType: "unpaid",
        subject: "Maintenance Payment Reminder",
        message: "Kindly clear your dues at the earliest.",
      },
      admin,
    );
    expect(r.body.ok).toBe(true);
    expect(r.body.target).toBe("Unpaid Maintenance Flats");
    // 102-2BHK has no payment recorded for 2027-04, so it must have been targeted.
    expect(r.body.sentCount).toBeGreaterThan(0);
  });

  it("only a super admin can clear the notification history", async () => {
    const deniedForPlainAdmin = await post(
      { action: "clearNotificationLogs" },
      plainAdminToken,
    );
    expect(deniedForPlainAdmin.code).toBe(403);
    const allowed = await post({ action: "clearNotificationLogs" }, superToken);
    expect(allowed.body.ok).toBe(true);
    expect((await get(superToken)).body.notificationLogs).toEqual([]);
  });

  it("ENABLE_NOTIFICATION=false disables sending/clearing and reports the feature as off", async () => {
    const prev = process.env.ENABLE_NOTIFICATION;
    delete process.env.ENABLE_NOTIFICATION;
    try {
      expect((await get(admin)).body.features.notification).toBe(false);

      const sendAttempt = await post(
        {
          action: "sendNotificationMessage",
          channel: "email",
          targetType: "all",
          subject: "Should not send",
          message: "Flag is off.",
        },
        admin,
      );
      expect(sendAttempt.code).toBe(403);

      const clearAttempt = await post(
        { action: "clearNotificationLogs" },
        admin,
      );
      expect(clearAttempt.code).toBe(403);
    } finally {
      if (prev === undefined) delete process.env.ENABLE_NOTIFICATION;
      else process.env.ENABLE_NOTIFICATION = prev;
    }
  });
});

describe("users list visibility", () => {
  beforeAll(async () => {
    // The "super" role can't be created through saveUser any more (only the
    // built-in "super-admin" account is meant to have that level of access);
    // it still exists in the schema for databases upgraded from before that
    // change, so insert one directly the way an old row would look, and
    // confirm listUsers still correctly hides it from plain admins.
    const { sql } = await import("../server/db.js");
    const { hash } = await import("../server/auth.js");
    await sql.query(
      "INSERT INTO users(username, pass, role) VALUES($1, $2, 'super') ON CONFLICT(username) DO NOTHING",
      ["secondsuper", hash("supersuper1")],
    );
  });

  it("a plain admin never sees super/superadmin accounts in the users list", async () => {
    const asPlainAdmin = (await post({ action: "listUsers" }, plainAdminToken))
      .body.users;
    expect(
      asPlainAdmin.some((u: any) => ["super", "superadmin"].includes(u.role)),
    ).toBe(false);
    expect(asPlainAdmin.some((u: any) => u.username === "secondsuper")).toBe(
      false,
    );
  });

  it("a super admin sees every account, including other super admins", async () => {
    const asSuperAdmin = (await post({ action: "listUsers" }, superToken)).body
      .users;
    expect(
      asSuperAdmin.some(
        (u: any) => u.username === "secondsuper" && u.role === "super",
      ),
    ).toBe(true);
  });
});
