import { useMemo, useState } from "react";
import type { ApartmentEvent, Data } from "../../../shared/types";
import type { Save } from "../../api.js";
import { openConfirm } from "../../components/ui/appDialog.js";
import DateTimePicker from "../../components/ui/DateTimePicker.jsx";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const localValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Events({
  data,
  admin,
  superAdmin,
  onSave,
}: {
  data: Data;
  admin: boolean;
  superAdmin: boolean;
  onSave: Save;
}) {
  const [editing, setEditing] = useState<ApartmentEvent | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState(
    localValue(new Date(Date.now() + 3600000)),
  );
  const [endsAt, setEndsAt] = useState(
    localValue(new Date(Date.now() + 7200000)),
  );
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const events = useMemo(
    () =>
      [...(data.events || [])].sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      ),
    [data.events],
  );
  const reset = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setStartsAt(localValue(new Date(Date.now() + 3600000)));
    setEndsAt(localValue(new Date(Date.now() + 7200000)));
  };
  const edit = (e: ApartmentEvent) => {
    setEditing(e);
    setTitle(e.title);
    setDescription(e.description);
    setLocation(e.location);
    setStartsAt(localValue(new Date(e.starts_at)));
    setEndsAt(localValue(new Date(e.ends_at)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async () => {
    if (!title.trim()) {
      setMsg("Event title is required");
      return;
    }
    const s = new Date(startsAt),
      e = new Date(endsAt);
    if (!(e > s)) {
      setMsg("End time must be after the start time");
      return;
    }
    if (s.getTime() <= Date.now()) {
      setMsg("An event must start in the future");
      return;
    }
    setBusy(true);
    const ok = await onSave(
      editing
        ? {
            action: "updateEvent",
            id: editing.id,
            title,
            description,
            location,
            startsAt: s.toISOString(),
            endsAt: e.toISOString(),
          }
        : {
            action: "createEvent",
            title,
            description,
            location,
            startsAt: s.toISOString(),
            endsAt: e.toISOString(),
          },
    );
    setBusy(false);
    if (ok) {
      setMsg(editing ? "Event updated" : "Event created");
      reset();
    }
  };
  const remove = async (id: number) => {
    if (
      !(await openConfirm({
        title: "Delete event?",
        message:
          "This permanently deletes the event. Only Super Admin can perform this action.",
        confirmLabel: "Delete event",
        danger: true,
      }))
    )
      return;
    await onSave({ action: "deleteEvent", id });
  };
  return (
    <div className="dash">
      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Events</h2>
            <p>Apartment meetings, social gatherings and community events.</p>
          </div>
        </div>
        {admin && (
          <div className="hall-form">
            <input
              maxLength={160}
              placeholder="Event title (e.g. Apartment General Meeting)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              maxLength={200}
              placeholder="Location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <div className="opt">
              <span>Starts</span>
              <DateTimePicker
                allowPast
                label="event start"
                value={startsAt}
                onChange={setStartsAt}
              />
            </div>
            <div className="opt">
              <span>Ends</span>
              <DateTimePicker
                allowPast
                label="event end"
                value={endsAt}
                onChange={setEndsAt}
              />
            </div>
            <textarea
              maxLength={2000}
              placeholder="Description / agenda / details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="row">
              <button className="btn-primary" disabled={busy} onClick={save}>
                {editing ? "Save changes" : "+ Add event"}
              </button>
              {editing && <button onClick={reset}>Cancel</button>}
            </div>
          </div>
        )}
        {msg && <p className="toast-error">{msg}</p>}
      </section>
      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <h2>Upcoming events</h2>
        </div>
        <div className="ticket-list">
          {events.length === 0 && (
            <p className="muted">No events have been scheduled.</p>
          )}
          {events.map((e) => (
            <article className="ticket-card" key={e.id}>
              <div className="ticket-card-head">
                <span className="badge badge-approved">Event</span>
                <span className="muted">{e.location || "Community"}</span>
              </div>
              <b>{e.title}</b>
              <p>
                {fmt(e.starts_at)} –{" "}
                {new Date(e.ends_at).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {e.description && <p className="muted">{e.description}</p>}{" "}
              {admin && (
                <div className="row ticket-actions">
                  <button onClick={() => edit(e)}>Edit</button>
                  {superAdmin && (
                    <button className="danger" onClick={() => remove(e.id)}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
