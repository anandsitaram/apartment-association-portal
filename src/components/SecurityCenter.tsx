import { useEffect, useState } from "react";
import { call, errText } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";
import LoadingState from "./ui/LoadingState.jsx";

export default function SecurityCenter({ token }: { token?: string }) {
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: "System maintenance in progress. Please try again shortly.",
  });
  const [retention, setRetention] = useState({
    tickets: 365,
    contacts: 365,
    audit: 730,
    security: 90,
  });
  const [events, setEvents] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const load = async () => {
    try {
      const r = await call<any>({ action: "getSystemSecurity" }, token);
      setMaintenance(r.maintenance);
      setRetention(r.retention);
      setEvents(r.security || []);
      setMsg("");
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const saveMaintenance = async () => {
    try {
      await call({ action: "setMaintenanceMode", ...maintenance }, token);
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };
  const saveRetention = async () => {
    try {
      await call({ action: "setRetention", ...retention }, token);
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };
  const revoke = async (username: string) => {
    if (
      !(await openConfirm({
        title: `Revoke all sessions for ${username}?`,
        message:
          "They will be signed out on their next request and must log in again.",
        confirmLabel: "Revoke sessions",
        danger: true,
      }))
    )
      return;
    try {
      await call({ action: "revokeUserSessions", username }, token);
      setMsg(`All sessions revoked for ${username}.`);
    } catch (e) {
      setMsg(errText(e));
    }
  };
  if (!ready && !msg) return <LoadingState label="Loading…" />;
  return (
    <div className="security-center">
      <div className="card">
        <h3>Maintenance mode</h3>
        <p className="muted">
          Temporarily blocks resident access while administrators work. Admin,
          Super Admin and Developer access remains available.
        </p>
        <label className="settings-toggle">
          <span>
            <b>Enable maintenance mode</b>
          </span>
          <input
            type="checkbox"
            checked={maintenance.enabled}
            onChange={(e) =>
              setMaintenance({ ...maintenance, enabled: e.target.checked })
            }
          />
        </label>
        <input
          maxLength={300}
          value={maintenance.message}
          onChange={(e) =>
            setMaintenance({ ...maintenance, message: e.target.value })
          }
          placeholder="Maintenance message"
        />
        <button className="pri" onClick={() => void saveMaintenance()}>
          Save maintenance mode
        </button>
      </div>
      <div className="card">
        <h3>Data retention</h3>
        <p className="muted">
          Automatic housekeeping keeps recent records while removing data older
          than these periods.
        </p>
        <div className="settings-form-grid">
          {(["tickets", "contacts", "audit", "security"] as const).map((k) => (
            <label key={k}>
              <span>{k[0].toUpperCase() + k.slice(1)} (days)</span>
              <input
                type="number"
                min={7}
                max={3650}
                value={retention[k]}
                onChange={(e) =>
                  setRetention({ ...retention, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <button className="pri" onClick={() => void saveRetention()}>
          Save retention
        </button>
      </div>
      <div className="card">
        <h3>Session management</h3>
        <p className="muted">
          Super Admin can revoke every active session for a user. Developer
          sessions expire sooner automatically.
        </p>
        <div className="row">
          <input id="revoke-user" placeholder="username" />
          <button
            onClick={() => {
              const el = document.getElementById(
                "revoke-user",
              ) as HTMLInputElement;
              if (el.value) void revoke(el.value);
            }}
          >
            Revoke all sessions
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Security events</h3>
        {msg && <p className="err">{msg}</p>}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>User</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString("en-IN")}</td>
                  <td>{e.type}</td>
                  <td>{e.username || "—"}</td>
                  <td>{e.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => void load()}>↻ Refresh</button>
      </div>
    </div>
  );
}
