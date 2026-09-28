import { useMemo, useState } from "react";
import { usePersistentState } from "../usePersistentState.js";
import { openConfirm, openPrompt } from "./ui/appDialog.js";
import type { Data, TicketCategory, TicketStatus } from "../../shared/types";
import type { Save } from "../api.js";

const CATEGORIES: { id: TicketCategory; label: string; icon: string }[] = [
  { id: "delivery", label: "Delivery", icon: "📦" },
  { id: "security", label: "Security", icon: "🛡️" },
  { id: "maintenance", label: "Maintenance", icon: "🔧" },
];
const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open — awaiting Admin review",
  approved: "Approved",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};
const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "badge-open",
  approved: "badge-approved",
  in_progress: "badge-progress",
  resolved: "badge-resolved",
  rejected: "badge-rejected",
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function Tickets({
  data,
  admin,
  superAdmin,
  myFlat,
  onSave,
}: {
  data: Data;
  admin: boolean;
  superAdmin?: boolean;
  myFlat: string | null;
  onSave: Save;
}) {
  const [category, setCategory] = useState<TicketCategory>("maintenance");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = usePersistentState<"all" | TicketStatus>(
    "rv_tickets_filter",
    "all",
  );

  const tickets = data.tickets || [];
  const visible = useMemo(
    () =>
      filter === "all" ? tickets : tickets.filter((t) => t.status === filter),
    [tickets, filter],
  );
  const openCount = tickets.filter((t) => t.status === "open").length;

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const ok = await onSave({
      action: "createTicket",
      category,
      title: title.trim(),
      description: description.trim(),
    });
    setBusy(false);
    if (ok) {
      setTitle("");
      setDescription("");
    }
  };

  const decide = async (id: number, status: TicketStatus) => {
    const note =
      status === "rejected"
        ? (await openPrompt({
            title: "Reject ticket",
            message: "Add an optional reason for the resident.",
            placeholder: "Reason (optional)",
            confirmLabel: "Reject",
          })) || ""
        : "";
    onSave({ action: "updateTicketStatus", id, status, note });
  };

  const remove = async (id: number) => {
    if (
      await openConfirm({
        title: "Delete this ticket?",
        message: "This permanently deletes the ticket and cannot be undone.",
        confirmLabel: "Delete ticket",
        danger: true,
      })
    )
      onSave({ action: "deleteTicket", id });
  };

  return (
    <div className="dash">
      <div className="kpi-grid">
        <div className="kpi kpi-plain kpi-orange">
          <span className="kpi-title">Open tickets</span>
          <div className="kpi-value">{openCount}</div>
          <div className="kpi-note">Awaiting Admin review</div>
        </div>
        <div className="mini">
          <span>Total raised</span>
          <b>{tickets.length}</b>
        </div>
        <div className="mini">
          <span>Resolved</span>
          <b>{tickets.filter((t) => t.status === "resolved").length}</b>
        </div>
      </div>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>Raise a ticket</h2>
            <p>
              Delivery, security or maintenance requests, sent straight to the
              Admin.
            </p>
          </div>
        </div>
        <div className="ticket-form">
          <div className="chips" role="tablist" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={category === c.id ? "pri" : ""}
                onClick={() => setCategory(c.id)}
                type="button"
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <input
            placeholder="Short title, e.g. 'Gate light not working'"
            autoComplete="off"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Details (optional)"
            autoComplete="off"
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={busy || !title.trim()}
            onClick={submit}
          >
            + Submit ticket
          </button>
          {!myFlat && !admin && (
            <p className="muted">
              Your login isn't linked to a flat, so a ticket you raise won't
              show your flat number.
            </p>
          )}
        </div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-head">
          <div>
            <h2>{admin ? "All tickets" : "Your tickets"}</h2>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="ticket-list">
          {visible.length === 0 && (
            <p className="muted">No tickets here yet.</p>
          )}
          {visible.map((t) => (
            <div className="ticket-card" key={t.id}>
              <div className="ticket-card-head">
                {t.status !== "resolved" && (
                  <span className={`badge ${STATUS_CLASS[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                )}
                <span className="muted">
                  {CATEGORIES.find((c) => c.id === t.category)?.icon}{" "}
                  {t.flat || "—"} · {fmt(t.created_at)}
                </span>
              </div>
              <b>{t.title}</b>
              {t.description && <p>{t.description}</p>}
              {t.note && (
                <p className="muted">
                  <i>Admin note: {t.note}</i>
                </p>
              )}
              {admin && (
                <div className="row ticket-actions">
                  {t.status !== "approved" && (
                    <button
                      className="pri"
                      onClick={() => decide(t.id, "approved")}
                    >
                      Approve
                    </button>
                  )}
                  {t.status !== "in_progress" && t.status !== "resolved" && (
                    <button onClick={() => decide(t.id, "in_progress")}>
                      In progress
                    </button>
                  )}
                  {t.status !== "resolved" && (
                    <button onClick={() => decide(t.id, "resolved")}>
                      Mark resolved
                    </button>
                  )}
                  {t.status !== "rejected" && (
                    <button
                      className="danger"
                      onClick={() => decide(t.id, "rejected")}
                    >
                      Reject
                    </button>
                  )}
                  {superAdmin && (
                    <button className="danger" onClick={() => remove(t.id)}>
                      🗑 Delete Ticket
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
