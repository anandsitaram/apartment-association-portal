import { hash, verify } from "../auth.js";
import { sql } from "../db.js";
import { fail } from "../http.js";
import type { Action } from "../types";
import { admins } from "./shared.js";
import { encryptData } from "../crypto.js";

const isSuper = (role: string) => role === "super" || role === "superadmin";

export const actions: Record<string, Action> = {
  listUsers: {
    role: "admin",
    users: true,
    async run(_b, ctx) {
      const users = await sql.query(
        isSuper(ctx.me.role)
          ? "SELECT username, role, flat, phone, email FROM users ORDER BY username"
          : "SELECT username, role, flat, phone, email FROM users WHERE role NOT IN ('super','superadmin','developer') ORDER BY username",
      );
      return { users };
    },
  },

  importFlatUsers: {
    role: "admin",
    users: true,
    async run(b, ctx) {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const mode = b.mode === "update" ? "update" : "create";
      if (!rows.length) fail(400, "No rows found in the import file");
      if (rows.length > 500)
        fail(400, "Import is limited to 500 rows at a time");
      const results: {
        row: number;
        username: string;
        status: string;
        message?: string;
      }[] = [];
      let created = 0;
      let updated = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        const name = String(r.username || "")
          .trim()
          .toLowerCase();
        const password = String(r.password || "");
        const flat = String(r.flat || "").trim();
        const phoneRaw = String(r.phone || "").trim();
        const emailRaw = String(r.email || "").trim();
        const rowNumber = i + 2;
        try {
          if (!/^[a-z0-9._-]{3,30}$/.test(name))
            throw new Error(
              "Username must be 3–30 letters/numbers; . _ - allowed",
            );
          if (mode === "update") {
            // Update mode only changes resident profile fields, never passwords, roles, sessions, or account creation.
            const [existing] = await sql.query(
              "SELECT role FROM users WHERE username=$1",
              [name],
            );
            if (!existing) {
              results.push({
                row: rowNumber,
                username: name,
                status: "skipped",
                message:
                  "Username not found; update mode does not create accounts",
              });
              continue;
            }
            if (existing.role !== "user") {
              results.push({
                row: rowNumber,
                username: name,
                status: "skipped",
                message:
                  "Only Flat User accounts can be updated by this import",
              });
              continue;
            }
            if (
              flat &&
              !(
                await sql.query("SELECT 1 AS x FROM flats WHERE flat=$1", [
                  flat,
                ])
              ).length
            )
              throw new Error(`Flat ${flat} does not exist`);
            const phone = phoneRaw ? encryptData(phoneRaw) : null;
            const email = emailRaw ? encryptData(emailRaw) : null;
            const [changed] = await sql.query(
              "UPDATE users SET flat=COALESCE($2,flat), phone=COALESCE($3,phone), email=COALESCE($4,email) WHERE username=$1 AND role='user' RETURNING username",
              [name, flat || null, phone, email],
            );
            if (changed) {
              updated++;
              results.push({
                row: rowNumber,
                username: name,
                status: "updated",
                message:
                  "Profile fields updated; blank cells were left unchanged",
              });
            } else
              results.push({
                row: rowNumber,
                username: name,
                status: "skipped",
                message: "Account was not updated",
              });
            continue;
          }
          if (password.length < 6)
            throw new Error("Password must be at least 6 characters");
          if (!flat) throw new Error("Flat is required");
          if (
            !(await sql.query("SELECT 1 AS x FROM flats WHERE flat=$1", [flat]))
              .length
          )
            throw new Error(`Flat ${flat} does not exist`);
          if (
            (
              await sql.query("SELECT 1 AS x FROM users WHERE username=$1", [
                name,
              ])
            ).length
          ) {
            results.push({
              row: rowNumber,
              username: name,
              status: "skipped",
              message: "Username already exists",
            });
            continue;
          }
          await sql.query(
            "INSERT INTO users(username,pass,role,flat,phone,email) VALUES($1,$2,'user',$3,$4,$5)",
            [
              name,
              hash(password),
              flat,
              phoneRaw ? encryptData(phoneRaw) : "",
              emailRaw ? encryptData(emailRaw) : "",
            ],
          );
          created++;
          results.push({ row: rowNumber, username: name, status: "created" });
        } catch (e) {
          results.push({
            row: rowNumber,
            username: name || "(blank)",
            status: "error",
            message: e instanceof Error ? e.message : "Invalid row",
          });
        }
      }
      const skipped = results.filter((x) => x.status === "skipped").length;
      const errors = results.filter((x) => x.status === "error").length;
      ctx.audit = {
        target: "bulk-flat-user-import",
        detail: { mode, rows: rows.length, created, updated, skipped, errors },
      };
      return { mode, created, updated, skipped, errors, results };
    },
  },

  saveUser: {
    role: "admin",
    users: true,
    async run(b, ctx) {
      const name = String(b.username || "")
        .trim()
        .toLowerCase();
      const pw = String(b.password || "");
      const requestedRole = String(b.role || "");
      const callerSuper = isSuper(ctx.me.role);
      const validRoles = callerSuper
        ? ["user", "admin", "developer"]
        : ["user", "admin"];
      if (
        !/^[a-z0-9._-]{3,30}$/.test(name) ||
        !validRoles.includes(requestedRole)
      )
        fail(
          400,
          "Username: 3-30 letters/numbers (. _ - allowed); valid role required",
        );

      const flat =
        requestedRole === "user" && b.flat ? String(b.flat).trim() : null;
      const phone = b.phone ? encryptData(String(b.phone)) : "";
      const email = b.email ? encryptData(String(b.email)) : "";
      if (
        flat &&
        !(await sql.query("SELECT 1 AS x FROM flats WHERE flat=$1", [flat]))
          .length
      )
        fail(400, `Flat ${flat} does not exist`);

      const [ex] = await sql.query("SELECT role FROM users WHERE username=$1", [
        name,
      ]);
      if (ex && isSuper(ex.role) && name === "super-admin")
        fail(400, "The built-in Super Admin isn't managed here");
      if (ex && isSuper(ex.role) && !callerSuper)
        fail(403, "Only Super Admin can manage Super Admin accounts");
      if (ex?.role === "developer" && !callerSuper)
        fail(403, "Only Super Admin can manage Developer accounts");
      if (requestedRole === "developer" && !callerSuper)
        fail(403, "Only Super Admin can create Developer accounts");
      if ((!ex || pw) && pw.length < 6)
        fail(400, "Password must be at least 6 characters");
      if (
        ex &&
        ex.role !== "user" &&
        requestedRole === "user" &&
        (await admins()) < 1
      )
        fail(400, "Keep at least one admin");

      if (ex) {
        await sql.query(
          pw
            ? "UPDATE users SET role=$2, flat=$3, phone=$4, email=$5, pass=$6, tok_ver=tok_ver+1 WHERE username=$1"
            : "UPDATE users SET role=$2, flat=$3, phone=$4, email=$5 WHERE username=$1",
          pw
            ? [name, requestedRole, flat, phone, email, hash(pw)]
            : [name, requestedRole, flat, phone, email],
        );
      } else {
        await sql.query(
          "INSERT INTO users(username,pass,role,flat,phone,email) VALUES($1,$2,$3,$4,$5,$6)",
          [name, hash(pw), requestedRole, flat, phone, email],
        );
      }
      ctx.audit = {
        target: name,
        detail: {
          role: requestedRole,
          flat,
          created: !ex,
          passwordChanged: !!pw,
        },
      };
    },
  },

  // Any signed-in user can change their own password (needs the current one)
  changePassword: {
    role: "user",
    async run(b, ctx) {
      const current = String(b.currentPassword || "");
      const next = String(b.newPassword || "");
      const [u] = await sql.query("SELECT pass FROM users WHERE username=$1", [
        ctx.me.username,
      ]);
      if (!u)
        fail(
          400,
          "This account's password is set on the server and can't be changed here",
        );
      if (!verify(current, u.pass)) fail(400, "Current password is incorrect");
      if (next.length < 6)
        fail(400, "New password must be at least 6 characters");
      if (next === current)
        fail(400, "New password must be different from the current one");
      await sql.query(
        "UPDATE users SET pass=$2, tok_ver=tok_ver+1 WHERE username=$1",
        [ctx.me.username, hash(next)],
      );
      ctx.audit = {
        target: ctx.me.username,
        detail: { passwordChanged: true },
      };
      return { ok: true, relogin: true };
    },
  },

  deleteUser: {
    role: "admin",
    users: true,
    async run(b, ctx) {
      const name = String(b.username || "").toLowerCase();
      const callerSuper = isSuper(ctx.me.role);
      if (name === ctx.me.username)
        fail(400, "You cannot delete your own account");
      const [target] = await sql.query(
        "SELECT role FROM users WHERE username=$1",
        [name],
      );
      if (!target) fail(404, "User not found");
      if (ctx.me.role === "admin") {
        const [stored] = await sql.query(
          "SELECT value FROM settings WHERE key='columns'",
        );
        if (stored?.value?.allowAdminUserDeletion === false)
          fail(403, "User deletion is restricted to Super Admin");
      }
      if (target.role === "developer" && !callerSuper)
        fail(403, "Only Super Admin can delete Developer accounts");
      if (isSuper(target.role)) {
        if (!callerSuper)
          fail(403, "Only Super Admin can delete Super Admin accounts");
        if (name === "super-admin")
          fail(400, "The built-in Super Admin isn't managed here");
      }
      if (
        ["admin", "super", "superadmin"].includes(target.role) &&
        (await admins()) <= 1
      )
        fail(400, "Keep at least one admin");
      await sql.query("DELETE FROM users WHERE username=$1", [name]);
      ctx.audit = { target: name, detail: { deletedRole: target.role } };
    },
  },
};
