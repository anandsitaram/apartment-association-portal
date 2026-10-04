import { useCallback, useEffect, useState } from "react";
import { call, errText } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";
import type { Flat } from "../../shared/types";

type ParcelNotice = {
  id: number;
  flat: string;
  courier: string;
  tracking_number: string;
  notes: string;
  photo_data: string;
  status: "pending" | "collected";
  created_at: string;
  acknowledged_at?: string | null;
};

type PhotoRequest = {
  id: number;
  visitor_name: string;
  flat: string;
  purpose: string;
  photo_data: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  review_note?: string;
};

type CodeRow = {
  id: number;
  code: string;
  visitor_name: string;
  flat: string;
  phone: string;
  purpose: string;
  visit_at?: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
};
export default function SecurityDesk({
  token,
  mode = "security",
  flats = [],
  userFlat = "",
}: {
  token?: string;
  mode?: "security" | "resident";
  flats?: Flat[];
  userFlat?: string;
}) {
  const securityMode = mode === "security";
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [photoRequests, setPhotoRequests] = useState<PhotoRequest[]>([]);
  const [parcelNotices, setParcelNotices] = useState<ParcelNotice[]>([]);
  const [form, setForm] = useState({
    visitorName: "",
    flat: "",
    phone: "",
    purpose: "Visitor",
    visitAt: "",
  });
  const [acceptCode, setAcceptCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (securityMode) {
      setCodes([]);
      setPhotoRequests([]);
      setParcelNotices([]);
      return;
    }
    try {
      const r = await call<{ codes: CodeRow[] }>(
        { action: "listMySecurityCodes" },
        token,
      );
      setCodes(r.codes || []);
      const approvals = await call<{ requests: PhotoRequest[] }>(
        { action: "listVisitorPhotoRequests" },
        token,
      );
      setPhotoRequests(approvals.requests || []);
      const parcels = await call<{ notices: ParcelNotice[] }>(
        { action: "listParcelNotices" },
        token,
      );
      setParcelNotices(parcels.notices || []);
    } catch (e) {
      setMessage(errText(e));
    }
  }, [token, securityMode]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!userFlat || form.flat || !flats.length) return;
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const requested = norm(userFlat);
    const match =
      flats.find((f) => norm(f.flat) === requested) ||
      flats.find((f) => norm(f.flat).startsWith(requested));
    if (match) setForm((current) => ({ ...current, flat: match.flat }));
  }, [userFlat, flats, form.flat]);
  const markParcelCollected = async (notice: ParcelNotice) => {
    const confirmed = await openConfirm({
      title: "Mark parcel as collected?",
      message: `Confirm the parcel for flat ${notice.flat} has been collected.`,
      confirmLabel: "Mark collected",
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await call({ action: "acknowledgeParcelNotice", id: notice.id }, token);
      await load();
      setMessage(`Parcel for flat ${notice.flat} marked as collected.`);
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await call<{ code: CodeRow }>(
        { action: "createSecurityCode", ...form },
        token,
      );
      setForm({
        visitorName: "",
        flat: "",
        phone: "",
        purpose: "Visitor",
        visitAt: "",
      });
      setMessage(`Access code ${r.code.code} created. It expires in 24 hours.`);
      await load();
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await call<{ accepted: CodeRow }>(
        { action: "acceptSecurityCode", code: acceptCode },
        token,
      );
      setMessage(
        `Accepted: ${r.accepted.visitor_name} for flat ${r.accepted.flat}.`,
      );
      setAcceptCode("");
      await load();
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const reviewPhotoRequest = async (
    request: PhotoRequest,
    status: "approved" | "rejected",
  ) => {
    if (
      !(await openConfirm({
        title:
          status === "approved"
            ? "Approve visitor entry?"
            : "Reject visitor entry?",
        message: `${status === "approved" ? "Allow" : "Deny"} access for ${request.visitor_name} to flat ${request.flat}?`,
        confirmLabel: status === "approved" ? "Approve entry" : "Reject entry",
        danger: status === "rejected",
      }))
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await call(
        { action: "reviewVisitorPhotoRequest", id: request.id, status },
        token,
      );
      setMessage(
        status === "approved"
          ? "Visitor approved. Security can allow entry."
          : "Visitor rejected. Security should deny entry.",
      );
      await load();
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteCode = async (c: CodeRow) => {
    if (
      !(await openConfirm({
        title: `Delete visitor code ${c.code}?`,
        message: `This will permanently remove the code for ${c.visitor_name} (flat ${c.flat}), including its accepted/used status.`,
        confirmLabel: "Delete code",
        danger: true,
      }))
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await call({ action: "deleteMySecurityCode", id: c.id }, token);
      setMessage(`Visitor code ${c.code} deleted.`);
      await load();
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const copyText = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy is not supported by this browser.");
      }
      setMessage(successMessage);
    } catch {
      setMessage(
        "Could not copy automatically. Please select and copy the code manually.",
      );
    }
  };
  const visitorMessage = (c: CodeRow) =>
    `My Apartment visitor access\nVisitor: ${c.visitor_name}\nFlat: ${c.flat}\nPurpose: ${c.purpose || "Visitor"}${c.phone ? `\nPhone: ${c.phone}` : ""}${c.visit_at ? `\nExpected visit: ${new Date(c.visit_at).toLocaleString()}` : ""}\nAccess code: ${c.code}\nCode expires: ${new Date(c.expires_at).toLocaleString()}\nPlease share this code with Security at the gate.`;
  const shareCode = async (c: CodeRow) => {
    const text = visitorMessage(c);
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Apartment visitor access", text });
        setMessage("Visitor access details shared.");
      } else {
        await copyText(
          text,
          "Sharing is not available on this device, so visitor details were copied instead.",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copyText(
        text,
        "Sharing is not available on this device, so visitor details were copied instead.",
      );
    }
  };
  return (
    <section className="security-desk-page">
      <h2>{securityMode ? "Security Desk" : "Visitor Access"}</h2>
      <p className="muted">
        {securityMode
          ? "Verify visitor access codes presented at the gate. Codes expire after 24 hours and can be accepted only once."
          : "Create visitor access codes for your guests. Security will verify the code when they arrive. Codes expire after 24 hours."}
      </p>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="security-desk-grid">
        {!securityMode && (
          <div className="card">
            <h3>Create visitor access code</h3>
            <label>
              Visitor name
              <input
                value={form.visitorName}
                onChange={(e) =>
                  setForm({ ...form, visitorName: e.target.value })
                }
                placeholder="Visitor / delivery person"
              />
            </label>
            <label>
              Flat number
              <select
                value={form.flat}
                onChange={(e) => setForm({ ...form, flat: e.target.value })}
                required
              >
                <option value="">Select your flat</option>
                {[...flats]
                  .sort((a, b) =>
                    a.flat.localeCompare(b.flat, undefined, { numeric: true }),
                  )
                  .map((f) => (
                    <option key={f.flat} value={f.flat}>
                      {f.flat}
                    </option>
                  ))}
              </select>
            </label>
            <small className="muted">
              Choose your flat from the Flats directory.
            </small>
            <label>
              Phone number (optional)
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Visitor phone"
              />
            </label>
            <label>
              Purpose
              <input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Visitor, delivery, service"
              />
            </label>
            <label>
              Expected visit date and time
              <input
                type="datetime-local"
                value={form.visitAt}
                onChange={(e) => setForm({ ...form, visitAt: e.target.value })}
              />
            </label>
            <small className="muted">
              This is the expected arrival time. The access code still expires
              24 hours after creation.
            </small>
            <button
              className="pri"
              disabled={busy || !form.visitorName.trim() || !form.flat.trim()}
              onClick={() => void create()}
            >
              {busy ? "Please wait…" : "Generate 6-digit code"}
            </button>
          </div>
        )}
        {securityMode && (
          <div className="card">
            <h3>Verify owner-approved visitor</h3>
            <p className="muted">
              Enter the 6-digit code after the flat owner has approved the
              visitor photo in My Apartment. Unapproved visitors cannot be
              accepted here.
            </p>
            <label>
              6-digit access code
              <input
                inputMode="numeric"
                maxLength={6}
                value={acceptCode}
                onChange={(e) =>
                  setAcceptCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
              />
            </label>
            <button
              className="pri"
              disabled={busy || acceptCode.length !== 6}
              onClick={() => void accept()}
            >
              Verify approved entry
            </button>
          </div>
        )}
      </div>
      {!securityMode && (
        <div className="card">
          <h3>Your visitor codes</h3>
          <p className="muted">
            Manage codes you created, including codes that have already been
            accepted or expired.
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Visitor</th>
                  <th>Flat</th>
                  <th>Purpose</th>
                  <th>Expected visit</th>
                  <th>Code expires</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong className="security-code">{c.code}</strong>
                    </td>
                    <td>
                      {c.visitor_name}
                      {c.phone ? (
                        <small className="muted">{c.phone}</small>
                      ) : null}
                    </td>
                    <td>{c.flat}</td>
                    <td>{c.purpose}</td>
                    <td>
                      {c.visit_at
                        ? new Date(c.visit_at).toLocaleString()
                        : "Not specified"}
                    </td>
                    <td>{new Date(c.expires_at).toLocaleString()}</td>
                    <td>
                      <span
                        className={`badge ${c.status === "accepted" ? "badge-approved" : c.status === "rejected" || c.status === "expired" ? "badge-rejected" : "badge-open"}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="visitor-code-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            void copyText(c.code, `Code ${c.code} copied.`)
                          }
                        >
                          Copy code
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void shareCode(c)}
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() => void deleteCode(c)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!codes.length && (
            <p className="muted">You have no recent visitor codes.</p>
          )}
        </div>
      )}
      {!securityMode && (
        <div className="card">
          <h3>Visitor photo approvals</h3>
          <p className="muted">
            Security-submitted visitor photos for your flat. Approve or reject
            pending visitors below.
          </p>
          {!photoRequests.length ? (
            <p className="muted">No visitor photo requests for your flat.</p>
          ) : (
            <div className="visitor-photo-requests">
              {photoRequests.map((request) => (
                <article className="visitor-photo-request" key={request.id}>
                  <div className="row-between">
                    <strong>
                      {request.visitor_name} · Flat {request.flat}
                    </strong>
                    <span
                      className={`badge ${request.status === "approved" ? "badge-approved" : request.status === "rejected" ? "badge-rejected" : "badge-open"}`}
                    >
                      {request.status}
                    </span>
                  </div>
                  <p className="muted">
                    {request.purpose || "Visitor"} · Submitted{" "}
                    {new Date(request.created_at).toLocaleString()}
                  </p>
                  <img
                    src={request.photo_data}
                    alt={`Visitor photo for ${request.visitor_name}`}
                    loading="lazy"
                  />
                  {request.review_note && (
                    <p className="muted">Note: {request.review_note}</p>
                  )}
                  {request.status === "pending" && (
                    <div className="visitor-code-actions">
                      <button
                        type="button"
                        className="pri"
                        disabled={busy}
                        onClick={() =>
                          void reviewPhotoRequest(request, "approved")
                        }
                      >
                        Approve entry
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          void reviewPhotoRequest(request, "rejected")
                        }
                      >
                        Reject entry
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {!securityMode && (
        <div className="card">
          <h3>Parcel delivery notices</h3>
          <p className="muted">
            Security records parcels delivered for your flat. Review the photo
            and mark the parcel as collected when you receive it.
          </p>
          {!parcelNotices.length ? (
            <p className="muted">No parcel notices for your flat.</p>
          ) : (
            <div className="visitor-photo-requests">
              {parcelNotices.map((notice) => (
                <article className="visitor-photo-request" key={notice.id}>
                  <div className="row-between">
                    <strong>Parcel · Flat {notice.flat}</strong>
                    <span
                      className={`badge ${notice.status === "collected" ? "badge-approved" : "badge-open"}`}
                    >
                      {notice.status === "collected"
                        ? "collected"
                        : "awaiting collection"}
                    </span>
                  </div>
                  <p className="muted">
                    {notice.courier || "Courier not specified"}
                    {notice.tracking_number
                      ? ` · ${notice.tracking_number}`
                      : ""}{" "}
                    · Recorded {new Date(notice.created_at).toLocaleString()}
                  </p>
                  {notice.notes && <p>{notice.notes}</p>}
                  <img
                    src={notice.photo_data}
                    alt={`Parcel for flat ${notice.flat}`}
                    loading="lazy"
                  />
                  {notice.status === "pending" ? (
                    <button
                      type="button"
                      className="pri"
                      disabled={busy}
                      onClick={() => void markParcelCollected(notice)}
                    >
                      Mark as collected
                    </button>
                  ) : (
                    <p className="muted">
                      Collected{" "}
                      {notice.acknowledged_at
                        ? new Date(notice.acknowledged_at).toLocaleString()
                        : ""}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
