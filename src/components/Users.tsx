import { useEffect, useState } from "react";
import type { Flat, Role } from "../../shared/types";
import { isSuperRole } from "../../shared/roles.js";
import { call, errText } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";
import LoadingState from "./ui/LoadingState.jsx";

interface UserRow {
  username: string;
  role: Role;
  flat: string | null;
  phone?: string | null;
  email?: string | null;
}

const ROLES: Record<string, string> = {
  user: "Flat User",
  admin: "Admin (create users, accept bookings, manage payments)",
  security: "Security Desk (verify and accept visitor codes only)",
};

const ROLE_DISPLAY: Record<string, string> = {
  ...ROLES,
  user: "Flat User",
  admin: "Admin",
  super: "Super Admin",
  superadmin: "Super Admin",
  developer: "Developer",
  security: "Security Desk",
};

export default function Users({
  token,
  me,
  flats = [],
  superAdmin = false,
  allowAdminUserDeletion = true,
  onOpenFlatUsers,
}: {
  token?: string;
  me?: string;
  flats?: Flat[];
  superAdmin?: boolean;
  allowAdminUserDeletion?: boolean;
  onOpenFlatUsers?: () => void;
}) {
  const blank = {
    username: "",
    password: "",
    role: "user",
    flat: "",
    phone: "",
    email: "",
  };
  const [list, setList] = useState<UserRow[]>([]),
    [f, setF] = useState(blank),
    [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);

  const load = async () => {
    try {
      setList(
        (await call<{ users?: UserRow[] }>({ action: "listUsers" }, token))
          .users || [],
      );
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (body: Record<string, unknown>) => {
    try {
      await call(body, token);
      setMsg("");
      setF(blank);
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };

  if (!ready && !msg) return <LoadingState label="Loading…" />;
  return (
    <>
      <h2>USERS – Account Management</h2>
      <p className="muted">
        Manage resident and Admin accounts. Developer accounts are managed
        separately by Super Admin under Developer Accounts.
        {onOpenFlatUsers && (
          <>
            {" "}
            To create many resident logins at once, use{" "}
            <button
              type="button"
              className="link-btn"
              onClick={onOpenFlatUsers}
            >
              Flat User Management
            </button>
            .
          </>
        )}
      </p>
      {msg && <p className="err">{msg}</p>}
      <div className="card">
        <h3>Add or edit one account</h3>
        <input
          placeholder="Username (e.g. flat101 or admin2)"
          autoComplete="off"
          autoCapitalize="none"
          value={f.username}
          onChange={(e) => setF({ ...f, username: e.target.value })}
        />
        <input
          placeholder="Password (min 6; leave blank to keep existing)"
          type="password"
          autoComplete="off"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <select
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value })}
        >
          {Object.entries(ROLES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {["user"].includes(f.role) && (
          <select
            value={f.flat}
            onChange={(e) => setF({ ...f, flat: e.target.value })}
          >
            <option value="">– flat this user is linked to –</option>
            {flats.map((x) => (
              <option key={x.flat} value={x.flat}>
                {x.flat}
                {x.name ? ` – ${x.name}` : ""}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder="Phone number (for SMS/WhatsApp notifications)"
          autoComplete="off"
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
        />
        <input
          placeholder="Email address (for notification alerts)"
          autoComplete="off"
          type="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
        />
        <button
          className="pri"
          onClick={() => run({ action: "saveUser", ...f })}
        >
          Save User Account
        </button>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Flat</th>
              <th>Phone</th>
              <th>Email</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.username}>
                <td>{u.username}</td>
                <td>{ROLE_DISPLAY[u.role] || u.role}</td>
                <td>{["user"].includes(u.role) ? u.flat || "—" : "—"}</td>
                <td>{u.phone || "—"}</td>
                <td>{u.email || "—"}</td>
                <td>
                  {isSuperRole(u.role) && u.username === "super-admin" ? (
                    <span className="muted">built-in superadmin</span>
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          setF({
                            username: u.username,
                            password: "",
                            role: u.role,
                            flat: u.flat || "",
                            phone: u.phone || "",
                            email: u.email || "",
                          })
                        }
                      >
                        Edit
                      </button>{" "}
                      {superAdmin &&
                        u.username !== me &&
                        u.role !== "super" &&
                        u.role !== "superadmin" && (
                          <button
                            onClick={async () => {
                              if (
                                await openConfirm({
                                  title: `Revoke all sessions for ${u.username}?`,
                                  message:
                                    "This signs the account out everywhere.",
                                  confirmLabel: "Revoke sessions",
                                  danger: true,
                                })
                              )
                                await run({
                                  action: "revokeUserSessions",
                                  username: u.username,
                                });
                            }}
                          >
                            Revoke sessions
                          </button>
                        )}
                      {u.username !== me &&
                        (superAdmin || allowAdminUserDeletion ? (
                          <button
                            className="danger"
                            onClick={async () => {
                              if (
                                await openConfirm({
                                  title: `Delete user ${u.username}?`,
                                  message:
                                    "This user account will be permanently deleted.",
                                  confirmLabel: "Delete user",
                                  danger: true,
                                })
                              )
                                await run({
                                  action: "deleteUser",
                                  username: u.username,
                                });
                            }}
                          >
                            Delete
                          </button>
                        ) : null)}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
