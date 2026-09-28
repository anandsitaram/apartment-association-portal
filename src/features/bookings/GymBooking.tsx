import { useMemo, useState } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import { openConfirm, openPrompt } from "../../components/ui/appDialog.js";
import TimePicker from "../../components/ui/TimePicker.js";
import DatePicker from "../../components/ui/DatePicker.js";
import type {
  BookingStatus,
  Data,
  GymBooking as Booking,
} from "../../../shared/types";
import type { Save } from "../../api.js";

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending Admin approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
const STATUS_CLASS: Record<BookingStatus, string> = {
  pending: "badge-open",
  approved: "badge-approved",
  rejected: "badge-rejected",
  cancelled: "badge-cancelled",
};
const EVENT_CLASS: Record<BookingStatus, string> = {
  pending: "gym-event-pending",
  approved: "gym-event-approved",
  rejected: "gym-event-rejected",
  cancelled: "gym-event-cancelled",
};
const dkey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtT = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function GymBooking({
  data,
  admin,
  superAdmin,
  myFlat,
  onSave,
}: {
  data: Data;
  admin: boolean;
  superAdmin: boolean;
  myFlat: string | null;
  onSave: Save;
}) {
  const today = new Date();
  const [viewMonthTs, setViewMonthTs] = usePersistentState<number>(
    "rv_gym_view_month",
    new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
  );
  const viewMonth = new Date(viewMonthTs);
  const setViewMonth = (value: Date) => setViewMonthTs(value.getTime());
  const [date, setDate] = useState(dkey(today));
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("08:00");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const bookings = data.gymBookings || [];
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = dkey(new Date(b.starts_at));
      const list = m.get(k);
      if (list) list.push(b);
      else m.set(k, [b]);
    }
    for (const list of m.values()) {
      list.sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
    }
    return m;
  }, [bookings]);

  // Always render six weeks, like a familiar calendar app. This prevents the
  // grid from jumping in height as the user moves between months.
  const first = viewMonth;
  const startPad = first.getDay();
  const totalCells = 42;
  const cells = Array.from(
    { length: totalCells },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), i - startPad + 1),
  );

  const goMonth = (delta: number) =>
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1),
    );

  const mobileDays = Array.from(
    {
      length: new Date(
        viewMonth.getFullYear(),
        viewMonth.getMonth() + 1,
        0,
      ).getDate(),
    },
    (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
  );

  const goToday = () => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setDate(dkey(today));
  };

  const selectDate = (k: string) => {
    setDate(k);
    const selected = new Date(`${k}T00:00:00`);
    if (selected.getMonth() !== viewMonth.getMonth()) {
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
  };

  const submit = async () => {
    if (!title.trim()) return;
    const startsAt = new Date(`${date}T${start}:00`);
    const endsAt = new Date(`${date}T${end}:00`);
    if (!(endsAt > startsAt)) {
      setMsg("End time must be after the start time");
      return;
    }
    if (startsAt.getTime() <= Date.now()) {
      await openConfirm({
        title: "Past time cannot be booked",
        message:
          "Please choose a future date and time. Party Hall and Gym bookings cannot be created for a time that has already started.",
        confirmLabel: "Choose another time",
        cancelLabel: "Close",
      });
      return;
    }
    setBusy(true);
    const ok = await onSave({
      action: "createGymBooking",
      title: title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      note: note.trim(),
    });
    setBusy(false);
    setMsg(ok ? "" : "Could not book that gym slot");
    if (ok) {
      setTitle("");
      setNote("");
    }
  };

  const decide = async (id: number, status: BookingStatus) => {
    const note =
      status === "rejected"
        ? (await openPrompt({
            title: "Reject gym booking",
            message: "Add an optional reason for the resident.",
            placeholder: "Reason (optional)",
            confirmLabel: "Reject",
          })) || ""
        : "";
    onSave({ action: "updateGymBookingStatus", id, status, note });
  };
  const deleteGymBooking = async (id: number) => {
    if (
      !(await openConfirm({
        title: "Delete this Gym booking?",
        message:
          "This permanently deletes the booking and cannot be undone. Only Super Admin can perform this action.",
        confirmLabel: "Delete booking",
        danger: true,
      }))
    )
      return;
    const success = await onSave({ action: "deleteGymBooking", id });
    if (!success) setMsg("The booking could not be deleted.");
  };

  const cancel = async (id: number) => {
    if (
      await openConfirm({
        title: "Cancel gym booking?",
        message: "The booking will be marked as cancelled.",
        confirmLabel: "Cancel booking",
        danger: true,
      })
    )
      onSave({ action: "cancelGymBooking", id });
  };

  const upcoming = [...bookings]
    .filter((b) => new Date(b.ends_at) >= new Date(Date.now() - 86400000))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );

  return (
    <div className="dash">
      <section className="dashboard-card gym-calendar-card">
        <div className="gym-calendar-toolbar">
          <div className="gym-calendar-title">
            <div>
              <h2>Gym calendar</h2>
              <p>
                Click a day to request a slot. Approved bookings are blocked
                automatically when times overlap.
              </p>
            </div>
          </div>
          <div className="gym-calendar-controls">
            <button type="button" onClick={goToday} className="calendar-today">
              Today
            </button>
            <button
              type="button"
              className="calendar-nav"
              aria-label="Previous month"
              onClick={() => goMonth(-1)}
            >
              ‹
            </button>
            <strong className="gym-calendar-month">
              {viewMonth.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              type="button"
              className="calendar-nav"
              aria-label="Next month"
              onClick={() => goMonth(1)}
            >
              ›
            </button>
          </div>
        </div>

        <div className="gym-calendar-legend" aria-label="Booking status legend">
          <span>
            <i className="gym-legend-dot approved" /> Approved
          </span>
          <span>
            <i className="gym-legend-dot pending" /> Pending
          </span>
        </div>

        <div className="gym-calendar-grid">
          {[
            ["Sun", "S"],
            ["Mon", "M"],
            ["Tue", "T"],
            ["Wed", "W"],
            ["Thu", "T"],
            ["Fri", "F"],
            ["Sat", "S"],
          ].map(([full, short], i) => (
            <div className="gym-calendar-weekday" key={i}>
              <span className="calendar-weekday-full">{full}</span>
              <span className="calendar-weekday-short">{short}</span>
            </div>
          ))}

          {cells.map((d) => {
            const k = dkey(d);
            const events = byDay.get(k) || [];
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const isToday = k === dkey(today);
            const isSelected = date === k;
            const visibleEvents = events.slice(0, 3);
            const extra = Math.max(0, events.length - visibleEvents.length);

            return (
              <div
                className={`gym-calendar-cell ${!inMonth ? "outside" : ""} ${isSelected ? "selected" : ""}`}
                key={k}
              >
                <button
                  type="button"
                  className={`gym-calendar-day ${isToday ? "today" : ""}`}
                  onClick={() => selectDate(k)}
                  aria-label={`Select ${d.toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}`}
                >
                  {d.getDate()}
                </button>
                <div className="gym-calendar-events">
                  {visibleEvents.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      className={`gym-calendar-event ${EVENT_CLASS[b.status]}`}
                      title={`${b.title} • ${fmtT(b.starts_at)}–${fmtT(b.ends_at)} • ${b.flat || "No flat"}`}
                      onClick={() => selectDate(k)}
                    >
                      <span className="gym-event-time">
                        {fmtT(b.starts_at)}
                      </span>
                      <span className="gym-event-title">{b.title}</span>
                    </button>
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      className="gym-calendar-more"
                      onClick={() => selectDate(k)}
                    >
                      +{extra} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mobile-booking-agenda">
          {mobileDays
            .filter((d) => {
              const k = dkey(d);
              return (byDay.get(k)?.length || 0) > 0 || k === date;
            })
            .map((d) => {
              const k = dkey(d);
              const events = byDay.get(k) || [];
              const isToday = k === dkey(today);
              const isSelected = k === date;
              return (
                <div
                  className={`mobile-agenda-day ${isSelected ? "selected" : ""}`}
                  key={k}
                >
                  <button
                    type="button"
                    className={`mobile-agenda-date ${isToday ? "today" : ""}`}
                    onClick={() => selectDate(k)}
                  >
                    <span>
                      {d.toLocaleDateString("en-IN", { weekday: "short" })}
                    </span>
                    <b>{d.getDate()}</b>
                  </button>
                  <div className="mobile-agenda-events">
                    {events.length ? (
                      events.map((b) => (
                        <button
                          type="button"
                          key={b.id}
                          className={`mobile-agenda-event ${EVENT_CLASS[b.status]}`}
                          onClick={() => selectDate(k)}
                        >
                          <b>
                            {fmtT(b.starts_at)}–{fmtT(b.ends_at)}
                          </b>
                          <span>{b.title}</span>
                          <small>{b.flat || "No flat"}</small>
                        </button>
                      ))
                    ) : (
                      <p className="muted">No bookings for this day.</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Book Gym Slot</h2>
            <p>
              Slot for{" "}
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
        </div>
        <div className="hall-form">
          <DatePicker
            value={date}
            minDate={dkey(today)}
            onChange={selectDate}
            label="Select gym date"
          />
          <TimePicker
            label="Select gym start time"
            value={start}
            onChange={setStart}
          />
          <span>to</span>
          <TimePicker
            label="Select gym end time"
            value={end}
            onChange={setEnd}
          />
          <input
            placeholder="Workout / activity description (e.g. Cardio & Strength)"
            autoComplete="off"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            placeholder="Note to Admin (optional)"
            autoComplete="off"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={busy || !title.trim()}
            onClick={submit}
          >
            + Request slot
          </button>
        </div>
        {msg && <p className="toast-error">{msg}</p>}
        {!myFlat && !admin && (
          <p className="muted">
            Your login isn't linked to a flat, so this request won't show a flat
            number.
          </p>
        )}
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <h2>Upcoming & recent gym bookings</h2>
        </div>
        <div className="ticket-list">
          {upcoming.length === 0 && (
            <p className="muted">No gym bookings yet.</p>
          )}
          {upcoming.map((b) => {
            const mine = myFlat && b.flat === myFlat;
            return (
              <div className="ticket-card" key={b.id}>
                <div className="ticket-card-head">
                  <span className={`badge ${STATUS_CLASS[b.status]}`}>
                    {STATUS_LABEL[b.status]}
                  </span>
                  <span className="muted">{b.flat || "—"}</span>
                </div>
                <b>{b.title}</b>
                <p>
                  {fmtDT(b.starts_at)} – {fmtT(b.ends_at)}
                </p>
                {b.note && (
                  <p className="muted">
                    <i>{b.note}</i>
                  </p>
                )}
                <div className="row ticket-actions">
                  {admin && b.status === "pending" && (
                    <>
                      <button
                        className="pri"
                        onClick={() => decide(b.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="danger"
                        onClick={() => decide(b.id, "rejected")}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {(admin || mine) &&
                    ["pending", "approved"].includes(b.status) && (
                      <button onClick={() => cancel(b.id)}>Cancel</button>
                    )}
                  {superAdmin && (
                    <button
                      onClick={() => deleteGymBooking(b.id)}
                      className="danger"
                    >
                      🗑 Delete booking
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
