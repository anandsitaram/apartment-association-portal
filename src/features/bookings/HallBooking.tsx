import { useMemo, useState } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import type {
  BookingStatus,
  Data,
  HallBooking as Booking,
  Settings,
} from "../../../shared/types";
import type { Save } from "../../api.js";
import ConfirmDialog from "../../components/ui/ConfirmDialog.js";
import { openConfirm, openPrompt } from "../../components/ui/appDialog.js";
import TimePicker from "../../components/ui/TimePicker.js";
import DatePicker from "../../components/ui/DatePicker.js";

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending approval",
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

export default function HallBooking({
  data,
  admin,
  superAdmin,
  myFlat,
  onSave,
  settings,
}: {
  data: Data;
  admin: boolean;
  superAdmin: boolean;
  myFlat: string | null;
  onSave: Save;
  settings: Settings;
}) {
  const today = new Date();
  const [viewMonthTs, setViewMonthTs] = usePersistentState<number>(
    "rv_hall_view_month",
    new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
  );
  const viewMonth = new Date(viewMonthTs);
  const setViewMonth = (value: Date) => setViewMonthTs(value.getTime());
  const [date, setDate] = useState(dkey(today));
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("21:00");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [cancelId, setCancelId] = useState<number | null>(null);

  const bookings = data.hallBookings || [];
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = dkey(new Date(b.starts_at));
      const list = m.get(k);
      if (list) list.push(b);
      else m.set(k, [b]);
    }
    return m;
  }, [bookings]);

  const first = viewMonth;
  const startPad = first.getDay();
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), i - startPad + 1),
  );

  const goToday = () => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setDate(dkey(today));
  };

  const mobileDays = Array.from(
    { length: daysInMonth },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1),
  );

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
      action: "createBooking",
      title: title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      note: note.trim(),
    });
    setBusy(false);
    setMsg(ok ? "" : "Could not book that slot");
    if (ok) {
      setTitle("");
      setNote("");
    }
  };

  const decide = async (id: number, status: BookingStatus) => {
    const note =
      status === "rejected"
        ? (await openPrompt({
            title: "Reject booking",
            message: "Add an optional reason for the resident.",
            placeholder: "Reason (optional)",
            confirmLabel: "Reject",
          })) || ""
        : "";
    onSave({ action: "updateBookingStatus", id, status, note });
  };
  const deleteBooking = async (id: number) => {
    if (
      !(await openConfirm({
        title: "Delete this Party Hall booking?",
        message:
          "This permanently deletes the booking and cannot be undone. Only Super Admin can perform this action.",
        confirmLabel: "Delete booking",
        danger: true,
      }))
    )
      return;
    const success = await onSave({ action: "deleteBooking", id });
    if (!success) setMsg("The booking could not be deleted.");
  };

  const clearAll = async () => {
    const ok = await openConfirm({
      title: "Clear all Party Hall bookings?",
      message:
        "Every Party Hall booking will be permanently deleted, including pending, approved, rejected and cancelled bookings. This cannot be undone.",
      confirmLabel: "Clear all bookings",
      cancelLabel: "Keep bookings",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const success = await onSave({ action: "clearAllHallBookings" });
    setBusy(false);
    setMsg(
      success
        ? "All Party Hall bookings were cleared."
        : "Could not clear Party Hall bookings",
    );
  };

  const cancel = (id: number) => setCancelId(id);
  const confirmCancel = async () => {
    if (cancelId == null) return;
    const ok = await onSave({ action: "cancelBooking", id: cancelId });
    if (ok) setCancelId(null);
  };

  const upcoming = [...bookings]
    .filter((b) => new Date(b.ends_at) >= new Date(Date.now() - 86400000))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );

  return (
    <div className="dash">
      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Party hall calendar</h2>
            <p>
              Green = approved, amber = pending approval. Overlapping an
              approved slot is blocked automatically.
            </p>
          </div>
          <div className="gym-calendar-controls">
            {admin &&
              (data.me?.role === "super" || data.me?.role === "superadmin") && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={clearAll}
                >
                  Clear all bookings
                </button>
              )}
            <b className="gym-calendar-month">
              {viewMonth.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </b>
            <button className="calendar-today" onClick={goToday}>
              Today
            </button>
            <button
              className="calendar-nav"
              aria-label="Previous month"
              onClick={() =>
                setViewMonth(
                  new Date(
                    viewMonth.getFullYear(),
                    viewMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
            >
              ‹
            </button>
            <button
              className="calendar-nav"
              aria-label="Next month"
              onClick={() =>
                setViewMonth(
                  new Date(
                    viewMonth.getFullYear(),
                    viewMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
            >
              ›
            </button>
          </div>
        </div>
        <div className="hall-cal">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <div className="hall-cal-head" key={i}>
              <span className="hall-weekday-full">{d}</span>
              <span className="hall-weekday-short">{d[0]}</span>
            </div>
          ))}
          {cells.map((d, i) => {
            const k = dkey(d);
            const outside = d.getMonth() !== viewMonth.getMonth();
            const events = byDay.get(k) || [];
            const isToday = k === dkey(today);
            const visible = events.slice(0, 2);
            const extra = Math.max(0, events.length - visible.length);
            return (
              <div
                key={i}
                className={`hall-cal-cell ${outside ? "outside" : ""} ${date === k ? "selected" : ""} ${isToday ? "today" : ""}`}
              >
                <button
                  type="button"
                  className="hall-cal-day"
                  onClick={() => setDate(k)}
                  aria-label={`Select ${d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
                >
                  {d.getDate()}
                </button>
                <div className="hall-cal-events">
                  {visible.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      className={`hall-cal-event ${b.status === "approved" ? "approved" : b.status === "pending" ? "pending" : "other"}`}
                      onClick={() => setDate(k)}
                      title={`${b.title} • ${fmtT(b.starts_at)}–${fmtT(b.ends_at)}`}
                    >
                      <span>{fmtT(b.starts_at)}</span>
                      <b>{b.title}</b>
                    </button>
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      className="hall-cal-more"
                      onClick={() => setDate(k)}
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
                    onClick={() => setDate(k)}
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
                          className={`mobile-agenda-event ${b.status === "approved" ? "approved" : b.status === "pending" ? "pending" : "other"}`}
                          onClick={() => setDate(k)}
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
            <h2>Request the hall</h2>
            <p>
              Booking for{" "}
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </p>
            <div className="booking-fee">
              <span>Booking amount</span>
              <b>
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 2,
                }).format(settings.hallBookingAmount || 0)}
              </b>
              <small>
                Payment is collected separately; requesting this slot does not
                charge you.
              </small>
            </div>
          </div>
        </div>
        <div className="hall-form">
          <div className="hall-form-grid">
            <label>
              <span>Date</span>
              <DatePicker
                value={date}
                minDate={dkey(today)}
                onChange={setDate}
                label="Select hall date"
              />
            </label>
            <label>
              <span>Start time</span>
              <TimePicker
                label="Select hall start time"
                value={start}
                onChange={setStart}
              />
            </label>
            <label>
              <span>End time</span>
              <TimePicker
                label="Select hall end time"
                value={end}
                onChange={setEnd}
              />
            </label>
            <label className="hall-form-wide">
              <span>Function / purpose</span>
              <input
                placeholder="e.g. Birthday party"
                autoComplete="off"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {!admin && (
              <label className="hall-form-wide">
                <span>
                  Note <small>(optional)</small>
                </span>
                <input
                  placeholder="Anything the approver should know"
                  autoComplete="off"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="hall-form-actions">
            <div>
              <b>
                {date
                  ? new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  : "Select a date"}
              </b>
              <span className="muted">
                Review the date, time and purpose before requesting.
              </span>
            </div>
            <button
              className="btn-primary"
              disabled={busy || !title.trim()}
              onClick={submit}
            >
              {busy ? "Requesting…" : "Request hall"}
            </button>
          </div>
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
          <h2>Upcoming & recent bookings</h2>
        </div>
        <div className="ticket-list">
          {upcoming.length === 0 && <p className="muted">No bookings yet.</p>}
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
                <p className="muted">
                  Booking amount:{" "}
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 2,
                  }).format(
                    Number(b.booking_amount ?? settings.hallBookingAmount ?? 0),
                  )}
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
                      onClick={() => deleteBooking(b.id)}
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
      <ConfirmDialog
        open={cancelId !== null}
        title="Cancel this booking?"
        message="This will cancel the party hall booking and make the slot available again. This action will be recorded in the audit log."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        danger
        onConfirm={confirmCancel}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
}
