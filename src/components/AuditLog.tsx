import { useEffect, useState } from "react";
import { openConfirm } from "./ui/appDialog.js";
import { call, errText } from "../api.js";
import LoadingState from "./ui/LoadingState.jsx";

interface Entry {
  id: number;
  at: string;
  username: string;
  action: string;
  target: string;
  detail?: Record<string, unknown>;
}

const short = (v: unknown) =>
  v === null || v === undefined || v === "" ? "–" : String(v);
// one readable line for an entry's details
const describe = (e: Entry) => {
  const d: Record<string, any> = e.detail || {};
  if (d.changes)
    return (
      (Object.entries(d.changes) as [string, [unknown, unknown]][])
        .map(([k, [a, b]]) =>
          k === "extra" ? "custom columns" : `${k} ${short(a)} → ${short(b)}`,
        )
        .join(", ") || "no change"
    );
  return Object.entries(d)
    .map(
      ([k, v]) =>
        `${k}: ${typeof v === "object" ? JSON.stringify(v) : short(v)}`,
    )
    .join(", ");
};

// Admins can review normal-user/Admin activity; Super Admins can review all activity.
export default function AuditLog({
  token,
  superAdmin,
}: {
  token?: string;
  superAdmin?: boolean;
}) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"all" | "features">("all");
  const load = async () => {
    try {
      setRows(
        (
          await call<{ entries: Entry[] }>(
            { action: "listAudit", limit: 200 },
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

  const handleClear = async () => {
    if (
      !(await openConfirm({
        title: "Clear all audit logs?",
        message: "All audit history will be permanently removed.",
        confirmLabel: "Clear logs",
        danger: true,
      }))
    )
      return;
    try {
      await call({ action: "clearAuditLog" }, token);
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };

  if (!ready && !msg) return <LoadingState label="Loading…" />;
  return (
    <>
      <div className="row">
        <span className="muted">Latest 200 changes, newest first</span>
        <button onClick={load}>↻ Refresh</button>
        {superAdmin && (
          <button className="danger" onClick={handleClear}>
            Clear Audit Log
          </button>
        )}
      </div>
      {msg && <p className="err">{msg}</p>}
      <div className="row">
        <label>
          View{" "}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All activity</option>
            <option value="features">Feature changes only</option>
          </select>
        </label>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Where</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {(rows || [])
              .filter(
                (e) =>
                  filter === "all" ||
                  e.target === "feature-configuration" ||
                  /feature/i.test(e.action),
              )
              .map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString("en-IN")}</td>
                  <td>{e.username}</td>
                  <td>{e.action}</td>
                  <td>{e.target}</td>
                  <td>{describe(e)}</td>
                </tr>
              ))}
            {rows && !rows.length && (
              <tr>
                <td colSpan={5}>Nothing recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
