import { useEffect, useState } from "react";
import { call, errText } from "../api.js";
import LoadingState from "./ui/LoadingState.jsx";

interface Entry {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  submitted_by: string;
  submitted_at: string;
  status: string;
  error?: string;
  read_at?: string | null;
  read_by?: string;
}

export default function ContactSubmissions({
  token,
}: {
  token?: string;
  superAdmin?: boolean;
}) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const load = async () => {
    try {
      setRows(
        (
          await call<{ entries: Entry[] }>(
            { action: "listContactSubmissions", limit: 200 },
            token,
          )
        ).entries,
      );
      setMsg("");
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const markRead = async (id: number) => {
    try {
      await call({ action: "markContactRead", id }, token);
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };
  if (!ready && !msg) return <LoadingState label="Loading…" />;
  return (
    <>
      <div className="row">
        <span className="muted">Latest contact messages</span>
        <button onClick={load}>↻ Refresh</button>
      </div>
      {msg && <p className="err">{msg}</p>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>From</th>
              <th>Subject</th>
              <th>Message</th>
              <th>Status</th>
              <th>Read</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.submitted_at).toLocaleString("en-IN")}</td>
                <td>
                  <strong>{r.name}</strong>
                  <br />
                  <span className="muted">{r.email}</span>
                  <br />
                  <span className="muted">Account: {r.submitted_by}</span>
                </td>
                <td>{r.subject || "(No subject)"}</td>
                <td style={{ whiteSpace: "pre-wrap", minWidth: 260 }}>
                  {r.message}
                </td>
                <td>
                  {r.status}
                  {r.error && <div className="err">{r.error}</div>}
                </td>
                <td>
                  {r.read_at
                    ? `${new Date(r.read_at).toLocaleString("en-IN")} by ${r.read_by || ""}`
                    : "Unread"}
                </td>
                <td>
                  {!r.read_at && (
                    <button onClick={() => markRead(r.id)}>Mark read</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && (
          <div className="empty-state">No contact submissions yet.</div>
        )}
      </div>
    </>
  );
}
