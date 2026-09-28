import { useEffect, useState } from "react";
import { call, errText } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";
import LoadingState from "./ui/LoadingState.jsx";

interface DeveloperRow {
  username: string;
  role: "developer";
  phone?: string | null;
  email?: string | null;
}

export default function DeveloperAccounts({
  token,
  me,
}: {
  token?: string;
  me?: string;
}) {
  const blank = { username: "", password: "", email: "" };
  const [list, setList] = useState<DeveloperRow[]>([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await call<{ users?: Array<DeveloperRow> }>(
        { action: "listUsers" },
        token,
      );
      setList((r.users || []).filter((u) => u.role === "developer"));
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await call(
        {
          action: "saveUser",
          username: form.username,
          password: form.password,
          role: "developer",
          email: form.email,
        },
        token,
      );
      setForm(blank);
      setMsg("");
      await load();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (username: string) => {
    if (
      !(await openConfirm({
        title: `Delete developer ${username}?`,
        message:
          "This permanently removes the developer login. It does not delete apartment data or feature settings.",
        confirmLabel: "Delete developer",
        danger: true,
      }))
    )
      return;
    try {
      await call({ action: "deleteUser", username }, token);
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };

  if (!ready && !msg) return <LoadingState label="Loading…" />;
  return (
    <>
      <h2>DEVELOPER ACCOUNTS</h2>
      <p className="muted">
        Super Admin only. Developers can configure enabled application features,
        but cannot manage residents, finances, bookings, or permissions.
      </p>
      {msg && <p className="err">{msg}</p>}
      <div className="card">
        <h3>Create developer</h3>
        <p className="muted">
          Developer accounts are separate from Admin accounts and cannot create
          other developers.
        </p>
        <div className="row">
          <input
            placeholder="Developer username"
            autoComplete="off"
            autoCapitalize="none"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <input
            placeholder="Password (min 6 characters)"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <input
            placeholder="Email address (optional)"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <button className="pri" disabled={saving} onClick={() => void save()}>
            {saving ? "Creating…" : "+ Create Developer"}
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Developer accounts</h3>
        {list.length === 0 ? (
          <p className="muted">No developer accounts created.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.username}>
                    <td>{u.username}</td>
                    <td>{u.email || "—"}</td>
                    <td>
                      {u.username === me ? (
                        <span className="muted">current account</span>
                      ) : (
                        <button
                          className="danger"
                          onClick={() => void remove(u.username)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
