import { useState } from "react";
import { call } from "../api.js";
import { notify } from "./ui/ToastHost.jsx";

export default function ChangePassword({
  token,
  onClose,
  onDone,
}: {
  token?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const problem =
    next && next.length < 6
      ? "New password must be at least 6 characters"
      : again && next !== again
        ? "Passwords do not match"
        : "";
  const ready = !!current && next.length >= 6 && next === again && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setErr("");
    try {
      await call(
        {
          action: "changePassword",
          currentPassword: current,
          newPassword: next,
        },
        token,
      );
      notify("Password changed. Please sign in again.", "success");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <h3 id="change-password-title">Change password</h3>
        <div className="opt">
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="opt">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="opt">
          <span>Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {(problem || err) && (
          <p className="err" role="alert">
            {err || problem}
          </p>
        )}
        <div className="row">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pri"
            disabled={!ready}
            onClick={submit}
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </div>
    </div>
  );
}
