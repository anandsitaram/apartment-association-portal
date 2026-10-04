import { useState } from "react";
import type { Data } from "../../shared/types";
import type { Save } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";
import DatePicker from "./ui/DatePicker.jsx";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function Polls({
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [busy, setBusy] = useState(false);

  const polls = [...(data.polls || [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const setOpt = (i: number, v: string) =>
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addOpt = () => options.length < 10 && setOptions((o) => [...o, ""]);
  const rmOpt = (i: number) =>
    setOptions((o) => o.filter((_, idx) => idx !== i));

  const create = async () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!title.trim() || clean.length < 2) return;
    setBusy(true);
    const ok = await onSave({
      action: "createPoll",
      title: title.trim(),
      description: description.trim(),
      options: clean,
      closesAt: closesAt || undefined,
    });
    setBusy(false);
    if (ok) {
      setTitle("");
      setDescription("");
      setOptions(["", ""]);
      setClosesAt("");
    }
  };

  const vote = (pollId: number, optionIndex: number) =>
    onSave({ action: "votePoll", pollId, optionIndex });
  const close = (id: number) => onSave({ action: "closePoll", id });
  const del = async (id: number) => {
    if (
      await openConfirm({
        title: "Delete this poll?",
        message: "This poll and its voting data will be removed.",
        confirmLabel: "Delete poll",
        danger: true,
      })
    )
      await onSave({ action: "deletePoll", id });
  };

  return (
    <div className="dash">
      {admin && (
        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div>
              <h2>Canvass members</h2>
              <p>
                Get a quick read on the next meeting date or a planned activity.
              </p>
            </div>
          </div>
          <div className="poll-form">
            <input
              placeholder="Question, e.g. 'Best date for the AGM?'"
              autoComplete="off"
              value={title}
              maxLength={150}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              placeholder="More detail (optional)"
              autoComplete="off"
              value={description}
              rows={2}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
            />
            {options.map((o, i) => (
              <div className="row" key={i}>
                <input
                  placeholder={`Option ${i + 1}`}
                  autoComplete="off"
                  value={o}
                  maxLength={120}
                  onChange={(e) => setOpt(i, e.target.value)}
                />
                {options.length > 2 && (
                  <button
                    className="danger"
                    onClick={() => rmOpt(i)}
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="row">
              <button
                onClick={addOpt}
                type="button"
                disabled={options.length >= 10}
              >
                + Add option
              </button>
              <div className="muted poll-close">
                <span>Closes on</span>
                <DatePicker
                  clearable
                  label="Poll closing date"
                  placeholder="No closing date"
                  value={closesAt}
                  onChange={setClosesAt}
                />
              </div>
            </div>
            <button
              className="btn-primary"
              disabled={
                busy ||
                !title.trim() ||
                options.filter((o) => o.trim()).length < 2
              }
              onClick={create}
            >
              + Start poll
            </button>
          </div>
        </section>
      )}

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <h2>{admin ? "All polls" : "Open polls"}</h2>
        </div>
        {polls.length === 0 && <p className="muted">No polls yet.</p>}
        <div className="ticket-list">
          {polls
            .filter((p) => admin || p.status === "open")
            .map((p) => {
              const max = Math.max(1, ...p.tally);
              const closed = Boolean(
                p.status === "closed" ||
                (p.closes_at && new Date(p.closes_at).getTime() < Date.now()),
              );
              return (
                <div className="ticket-card" key={p.id}>
                  <div className="ticket-card-head">
                    <span
                      className={`badge ${closed ? "badge-cancelled" : "badge-approved"}`}
                    >
                      {closed ? "Closed" : "Open"}
                    </span>
                    <span className="muted">
                      {p.totalVotes} vote{p.totalVotes === 1 ? "" : "s"}
                      {p.closes_at ? ` · closes ${fmt(p.closes_at)}` : ""}
                    </span>
                  </div>
                  <b>{p.title}</b>
                  {p.description && <p>{p.description}</p>}
                  <div className="poll-options">
                    {p.options.map((o, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`poll-option ${p.myVote === i ? "chosen" : ""}`}
                        disabled={closed}
                        onClick={() => vote(p.id, i)}
                      >
                        <span className="poll-option-label">
                          {p.myVote === i ? "✓ " : ""}
                          {o}
                        </span>
                        <span className="poll-bar-track">
                          <span
                            className="poll-bar-fill"
                            style={{ width: `${(p.tally[i] / max) * 100}%` }}
                          />
                        </span>
                        <span className="poll-count">{p.tally[i]}</span>
                      </button>
                    ))}
                  </div>
                  {admin && (
                    <div className="row ticket-actions">
                      {!closed && (
                        <button onClick={() => close(p.id)}>Close poll</button>
                      )}
                      {superAdmin && (
                        <button className="danger" onClick={() => del(p.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
