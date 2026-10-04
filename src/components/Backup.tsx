import { useEffect, useState } from "react";
import { APP_BRAND_NAME } from "../../shared/branding";
import type { Features, Settings } from "../../shared/types";
import { call, errText } from "../api.js";

import { notify } from "./ui/ToastHost.jsx";
import { openConfirm } from "./ui/appDialog.js";
interface BackupRow {
  id: number;
  at: string;
  size: number;
}
import { download } from "../export.js";

const save = async (backup: unknown, name: string) =>
  download(
    new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" }),
    name,
  );
const day = (d: string) => new Date(d).toISOString().slice(0, 10);
const safeOrg = (settings: Settings) =>
  (settings.orgShort || settings.orgName || APP_BRAND_NAME)
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "my-apartment";

// JSON backups of all data (not user passwords). Super admin only.
export default function Backup({
  token,
  features,
  superAdmin,
  settings,
}: {
  token?: string;
  features: Features;
  superAdmin: boolean;
  settings: Settings;
}) {
  const [list, setList] = useState<BackupRow[]>([]);
  const [msg, setMsg] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setMsg("");
      await fn();
    } catch (e) {
      setMsg(errText(e));
    }
  };
  useEffect(() => {
    if (features.autoBackup)
      run(async () =>
        setList(
          (
            await call<{ backups: BackupRow[] }>(
              { action: "listBackups" },
              token,
            )
          ).backups,
        ),
      );
  }, []);
  return (
    <>
      {msg && <p className="err">{msg}</p>}
      <div className="card">
        <b>Download a backup now</b>
        <span className="muted">
          One JSON file with flats, months, payments, column settings and
          deleted-month figures. Keep a copy somewhere safe (Drive, e-mail).
        </span>
        <div className="row">
          <span />
          <button
            className="pri"
            onClick={() =>
              run(async () => {
                const { backup } = await call({ action: "backup" }, token);
                await save(
                  backup,
                  `${safeOrg(settings)}-backup-${day(backup.at)}.json`,
                );
              })
            }
          >
            ⬇ Download backup
          </button>
        </div>
      </div>
      {features.autoBackup && (
        <>
          <h3>▶ Daily backups kept in the database</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Taken</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.at).toLocaleString("en-IN")}</td>
                    <td className="r">{Math.ceil(b.size / 1024)} KB</td>
                    <td>
                      <button
                        onClick={() =>
                          run(async () => {
                            const { backup } = await call(
                              { action: "getBackup", id: b.id },
                              token,
                            );
                            await save(
                              backup,
                              `${safeOrg(settings)}-backup-${day(b.at)}.json`,
                            );
                          })
                        }
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={3}>
                      None yet – the first one is taken by tonight's daily job.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {superAdmin && (
        <div className="card card-danger">
          <b>Restore database backup</b>
          <span className="muted">
            Super Admin only. This replaces backed-up application data.
            Upload/paste a trusted JSON backup, type RESTORE, and confirm.
          </span>
          <textarea
            rows={6}
            value={restoreText}
            onChange={(e) => setRestoreText(e.target.value)}
            placeholder="Paste backup JSON here"
          />
          <div className="row">
            <input
              placeholder="Type RESTORE"
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
            />
            <button
              className="danger"
              disabled={!restoreText || restoreConfirm !== "RESTORE"}
              onClick={async () => {
                if (
                  !(await openConfirm({
                    title: "Restore database?",
                    message:
                      "This replaces application data with the supplied backup. Make sure you have a current backup first.",
                    confirmLabel: "Restore database",
                    danger: true,
                  }))
                )
                  return;
                await run(async () => {
                  await call(
                    {
                      action: "restoreBackup",
                      backup: restoreText,
                      confirm: restoreConfirm,
                    },
                    token,
                  );
                  notify("Backup restored successfully. Reloading…", "success");
                  setTimeout(() => location.reload(), 500);
                });
              }}
            >
              Restore backup
            </button>
          </div>
        </div>
      )}
      <p className="legend">
        Backups exclude login attempt/security telemetry and never expose
        passwords through the normal download action.
      </p>

      {superAdmin && (
        <>
          <h3>▶ Danger zone</h3>
          <div className="card card-danger">
            <b>Clear all data in the database</b>
            <span className="muted">
              Permanently deletes every month, payment, flat, Corp Fund ledger
              entry and column setting. Your login accounts, the audit log, and
              any backups you've downloaded or that are listed above are not
              touched — so you can always restore from one afterwards. This
              cannot be undone.
            </span>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <input
                placeholder="Type DELETE to confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <button
                className="danger"
                disabled={confirmText !== "DELETE" || wiping}
                onClick={async () => {
                  if (
                    !(await openConfirm({
                      title: "Erase all data?",
                      message:
                        "This permanently erases every month, payment, flat and Corpus Fund entry. Download a backup first if you have not. This cannot be undone.",
                      confirmLabel: "Erase all data",
                      danger: true,
                    }))
                  )
                    return;
                  await run(async () => {
                    setWiping(true);
                    try {
                      await call(
                        { action: "wipeAll", confirm: confirmText },
                        token,
                      );
                      setConfirmText("");
                      notify("All data has been cleared.", "success");
                      location.reload();
                    } finally {
                      setWiping(false);
                    }
                  });
                }}
              >
                🗑 {wiping ? "Clearing…" : "Clear all data"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
