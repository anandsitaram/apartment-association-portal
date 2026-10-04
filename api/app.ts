import {
  adminPasswordVersion,
  assertSecuritySecrets,
  read,
  safeEqual,
  sign,
  verify,
} from "../server/auth.js";
import { LOGIN_RATE_LIMIT } from "../server/flags.js";
import { init, sql } from "../server/db.js";
import { HttpError } from "../server/http.js";
import { audit } from "../server/audit.js";
import { actions } from "../server/actions.js";
import { FEATURE_ACTIONS, featureEnabled } from "../server/feature-config.js";
import { snapshot } from "../server/snapshot.js";
import { securityEvent } from "../server/security.js";
import { randomUUID } from "node:crypto";
import { canAccessRole, roleDenialMessage } from "../server/permissions.js";
import type { Actor, Body, Ctx, Req, Res } from "../server/types";
import type { Role } from "../shared/types";
import {
  clearFails,
  clientIp,
  contactKeys,
  guard,
  loginKeys,
  recordFail,
} from "../server/ratelimit.js";

const bad = (res: Res, code: number, error: string) =>
  res.status(code).json({ error });
const sessionExpiry = (role: Role) =>
  Date.now() + (role === "developer" ? 8 * 3600e3 : 30 * 864e5);

async function login(req: Req, res: Res, b: Body) {
  const name = String(b.username || "")
    .trim()
    .toLowerCase();
  const keys = loginKeys(name, clientIp(req));
  if (LOGIN_RATE_LIMIT()) await guard(keys);
  let user: {
    name: string;
    role: Role;
    flat?: string | null;
    token: { u: string; v?: number; m?: "a"; apv?: string };
  } | null = null;
  if (
    name === "super-admin" &&
    process.env.ADMIN_PASSWORD &&
    safeEqual(String(b.password || ""), process.env.ADMIN_PASSWORD)
  ) {
    user = {
      name: "super-admin",
      role: "superadmin",
      token: { u: "super-admin", m: "a", apv: adminPasswordVersion() },
    };
  } else {
    const [u] = await sql.query("SELECT * FROM users WHERE username=$1", [
      name,
    ]);
    if (u && verify(String(b.password || ""), u.pass))
      user = {
        name: u.username,
        role: u.role as Role,
        flat: u.flat || null,
        token: { u: u.username, v: u.tok_ver || 0 },
      };
  }
  if (!user) {
    await securityEvent("login_failed", name, clientIp(req), {
      reason: "invalid_credentials",
    });
    if (LOGIN_RATE_LIMIT()) await recordFail(keys);
    return bad(res, 401, "Wrong username or password");
  }
  if (LOGIN_RATE_LIMIT()) await clearFails(keys);
  await audit(
    { username: user.name, role: user.role, flat: user.flat ?? null },
    "login",
    user.name,
    { role: user.role },
  );
  const { token, ...rest } = user;
  const sid = randomUUID();
  await securityEvent("login_success", user.name, clientIp(req), {
    role: user.role,
  });
  return res.json({
    token: sign({ ...token, sid, exp: sessionExpiry(user.role) }),
    user: rest,
  });
}

async function whoami(req: Req): Promise<Actor | null> {
  const p = read(
    String(req.headers.authorization || "").replace("Bearer ", ""),
  );
  if (!p) return null;
  if (p.m === "a") {
    if (!process.env.ADMIN_PASSWORD || p.apv !== adminPasswordVersion())
      return null;
    return { username: "super-admin", role: "superadmin" };
  }
  const [u] = await sql.query(
    "SELECT username, role, flat, tok_ver FROM users WHERE username=$1",
    [p.u],
  );
  if (!u) return null;
  if ((p.v || 0) !== (u.tok_ver || 0)) return null;
  return { username: u.username, role: u.role, flat: u.flat } as Actor;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    let b: Body = req.body || {};
    if (typeof b === "string") {
      try {
        b = JSON.parse(b);
      } catch {
        b = {};
      }
    }

    const hasBearerToken = /^Bearer\s+\S+/i.test(
      String(req.headers.authorization || ""),
    );
    const isLoginRequest = req.method === "POST" && b.action === "login";
    const isPublicContactRequest =
      req.method === "POST" && b.action === "sendContactMessage";

    // Reject anonymous protected requests before initializing the database.
    // This makes an unauthenticated dashboard load return 401 immediately,
    // rather than appearing to hang while a database connection starts up.
    if (
      !hasBearerToken &&
      !isLoginRequest &&
      !isPublicContactRequest &&
      (req.method === "GET" || req.method === "POST")
    ) {
      return res
        .status(401)
        .json({ error: "Login required", authRequired: true });
    }

    // Authentication and encryption keys are deliberately independent. Fail
    // closed before touching protected database values if deployment config is incomplete.
    assertSecuritySecrets();
    if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
      return bad(
        res,
        500,
        "DATABASE_URL is not set. Add your Neon or Supabase connection string on Vercel and in .env.local",
      );
    }
    await init();
    if (isLoginRequest) return await login(req, res, b);
    const me = await whoami(req);
    if (req.method === "GET") {
      if (!me)
        return res
          .status(401)
          .json({ error: "Login required", authRequired: true });
      const screen = String(req.headers["x-rv-screen"] || "");
      const month = String(req.headers["x-rv-month"] || "");
      return res.json(await snapshot(me, screen, month));
    }
    const publicContact = !me && b.action === "sendContactMessage";
    if (!me && !publicContact) return bad(res, 401, "Login required");
    if (publicContact) {
      const keys = contactKeys(clientIp(req));
      await guard(keys);
      // Count every public submission before processing it so failed submissions
      // cannot be used to bypass the throttle or repeatedly trigger email sends.
      await recordFail(keys);
    }
    if (me?.role === "user" && b.action !== "sendContactMessage") {
      const [mr] = await sql.query(
        "SELECT value FROM settings WHERE key='maintenance' LIMIT 1",
      );
      if (mr?.value?.enabled)
        return bad(
          res,
          503,
          String(
            mr.value.message ||
              "System maintenance in progress. Please try again shortly.",
          ),
        );
    }
    const a = actions[b.action];
    if (!a) return bad(res, 400, "Unknown action");
    const need = a.role || "admin";
    const allowed = canAccessRole(me?.role, need);
    if (!publicContact && !allowed)
      return bad(res, 403, roleDenialMessage(need));
    const configuredFeature = FEATURE_ACTIONS[b.action];
    if (configuredFeature) {
      const enabled = await featureEnabled(configuredFeature);
      if (!enabled) return bad(res, 403, "This feature is disabled");
    }
    if (a.flag && !a.flag())
      return bad(res, 400, "This feature is switched off");
    const actor = me || { username: "public", role: "user", flat: null };
    const ctx: Ctx = { me: actor, req, audit: null };
    const out = await a.run(b, ctx);
    // Every successful mutating action is audited. Individual modules may
    // provide a richer target/detail; read-only listing actions are excluded
    // so merely opening a page does not create noisy audit records.
    const readOnlyActions = new Set([
      "listAudit",
      "listPaymentHistory",
      "listUsers",
      "getFeatureConfig",
      "listBackups",
      "getBackup",
      "listNotificationLogs",
      "getSystemSecurity",
      "listSecurityEvents",
    ]);
    if (!readOnlyActions.has(b.action)) {
      const target =
        ctx.audit?.target ??
        b.id ??
        b.month ??
        b.flat ??
        b.username ??
        b.title ??
        b.action;
      const detail = ctx.audit?.detail ?? { source: "action" };
      await audit(actor, b.action, target, detail);
    }
    return res.json(out ?? { ok: true });
  } catch (e: any) {
    if (
      e instanceof HttpError ||
      (e &&
        typeof e.code === "number" &&
        typeof e.message === "string" &&
        e.code >= 400 &&
        e.code < 600)
    )
      return bad(res, e.code, e.message);
    console.error("Vercel API error:", e);
    return bad(res, 500, "Server error. Please try again later.");
  }
}
