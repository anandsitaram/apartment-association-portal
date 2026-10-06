import { useState } from "react";
import {
  APP_BRAND_NAME,
  APP_BRAND_SHORT,
  SUPPORT_EMAIL,
} from "../../shared/branding";

export default function Login({
  onLogin,
  msg,
  onCancel,
}: {
  onLogin: (username: string, password: string) => unknown;
  msg: string;
  onCancel: (() => void) | null;
}) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const submit = () => u.trim() && p && onLogin(u.trim(), p);
  // Branding is intentionally fixed in shared/branding.ts; login must not depend on
  // localStorage or database settings because neither is guaranteed before sign-in.
  const orgFull = APP_BRAND_NAME;
  const mark = APP_BRAND_SHORT;

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-hero">
          <div className="login-hero-image" aria-hidden="true" />
          <div className="login-hero-content">
            {logoFailed ? (
              <div className="login-hero-mark show" aria-hidden="true">
                {mark}
              </div>
            ) : (
              <img
                className="login-hero-logo"
                src="/my-apartment-logo.svg"
                alt="My Apartment"
                onError={() => setLogoFailed(true)}
              />
            )}
            <h2>{orgFull}</h2>
            <p>
              Maintenance and corpus fund tracking for every flat, all in one
              place.
            </p>
            <ul>
              <li>Month-wise collections and balances</li>
              <li>Corpus fund at a glance</li>
              <li>Clear, transparent records</li>
            </ul>
          </div>
        </aside>

        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h1>Welcome back</h1>
          <p className="login-help">
            Sign in to access your My Apartment account
          </p>

          <label htmlFor="rv-user">Username</label>
          <input
            id="rv-user"
            name="username"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            placeholder="Enter your username"
            value={u}
            onChange={(e) => setU(e.target.value)}
          />

          <label htmlFor="rv-pass">Password</label>
          <div className="pw-wrap">
            <input
              id="rv-pass"
              name="password"
              autoComplete="current-password"
              type={show ? "text" : "password"}
              placeholder="Enter your password"
              value={p}
              onChange={(e) => setP(e.target.value)}
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          {msg && (
            <p className="login-error" role="alert">
              {msg}
            </p>
          )}
          <button
            type="submit"
            className="login-submit"
            disabled={!u.trim() || !p}
          >
            Sign in
          </button>
          <div className="login-contact" aria-label="Contact us">
            <span>Need help?</span>{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
          {onCancel && (
            <button type="button" className="login-cancel" onClick={onCancel}>
              Continue without signing in
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
