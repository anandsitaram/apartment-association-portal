import { useEffect, useMemo, useState } from "react";
import type { Flat } from "../../shared/types";
import { call, errText } from "../api.js";
import { openConfirm } from "./ui/appDialog.js";
import LoadingState from "./ui/LoadingState.jsx";
import FlatDataImport from "./FlatDataImport.jsx";

interface UserRow {
  username: string;
  role: string;
  flat: string | null;
  phone?: string | null;
  email?: string | null;
}
type ImportMode = "create" | "update";
interface ImportResult {
  row: number;
  username: string;
  status: string;
  message?: string;
}
interface ImportReport {
  mode: ImportMode;
  created?: number;
  updated?: number;
  skipped: number;
  errors: number;
  results?: ImportResult[];
}

const saveWorkbook = (buffer: ArrayBuffer, name: string) => {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

// Resident login accounts (one or more per flat). Flat records themselves are managed on the Flats page.
export default function FlatUserManagement({
  token,
  flats = [],
  onImportFlats,
  onOpenFlats,
  onOpenUsers,
}: {
  token?: string;
  flats?: Flat[];
  onImportFlats: (
    rows: Record<string, string>[],
    mode: "create" | "update",
  ) => Promise<any>;
  onOpenFlats?: () => void;
  onOpenUsers?: () => void;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ImportMode>("create");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const load = async () => {
    try {
      const r = await call<{ users?: UserRow[] }>(
        { action: "listUsers" },
        token,
      );
      setUsers((r.users || []).filter((u) => u.role === "user"));
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const byFlat = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of users)
      if (u.flat) m.set(u.flat, [...(m.get(u.flat) || []), u.username]);
    return m;
  }, [users]);
  const withoutLogin = flats.filter((f) => !byFlat.has(f.flat)).length;
  const shown = onlyMissing ? flats.filter((f) => !byFlat.has(f.flat)) : flats;

  const downloadTemplate = async () => {
    const mod = await import("exceljs");
    const ExcelJS = mod.default || mod;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Flat Users");
    ws.columns = [
      { header: "username", key: "username", width: 20 },
      { header: "password", key: "password", width: 20 },
      { header: "flat", key: "flat", width: 16 },
      { header: "phone", key: "phone", width: 18 },
      { header: "email", key: "email", width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const guide = wb.addWorksheet("Instructions");
    [
      ["Flat User Management – bulk import of resident login accounts"],
      ["Fill one row per resident login in the Flat Users sheet."],
      [
        "Create mode: username, password and flat are required. Password must be at least 6 characters.",
      ],
      [
        "Update mode: username identifies an existing Flat User. Non-empty flat, phone and email values update that account; blank cells are left unchanged.",
      ],
      [
        "Update mode never changes passwords, roles or sessions, and never creates new accounts.",
      ],
      [
        "Username must be 3–30 characters: letters, numbers, dot, underscore or hyphen.",
      ],
      [
        "The flat must already exist. Add or import flats first on the Flats page.",
      ],
      ["Create mode skips usernames that already exist."],
      [
        "Set a temporary password and share it securely. Ask residents to change it after their first login.",
      ],
      ["More than one login can be linked to the same flat if needed."],
    ].forEach((r) => guide.addRow(r));
    guide.getColumn(1).width = 100;
    saveWorkbook(
      await wb.xlsx.writeBuffer(),
      "my-apartment-flat-user-template.xlsx",
    );
  };

  // Login accounts only: never includes passwords
  const exportUsers = async () => {
    const mod = await import("exceljs");
    const ExcelJS = mod.default || mod;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Flat Users");
    ws.columns = [
      { header: "username", key: "username", width: 20 },
      { header: "flat", key: "flat", width: 16 },
      { header: "phone", key: "phone", width: 18 },
      { header: "email", key: "email", width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const u of users)
      ws.addRow({
        username: u.username,
        flat: u.flat || "",
        phone: u.phone || "",
        email: u.email || "",
      });
    const guide = wb.addWorksheet("Instructions");
    guide.addRow([
      "Flat user export – passwords are never included. Keep this file private; it contains contact details.",
    ]);
    guide.addRow([
      "To change accounts, add a password column only for NEW users and upload with Create mode; use Update mode to change flat, phone or email.",
    ]);
    guide.getColumn(1).width = 110;
    saveWorkbook(
      await wb.xlsx.writeBuffer(),
      `my-apartment-flat-users-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setReport(null);
    setMsg("");
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.getWorksheet("Flat Users") || wb.worksheets[0];
      if (!ws) throw new Error("The workbook has no worksheet");
      const headers: string[] = [];
      ws.getRow(1).eachCell((cell: any, col: number) => {
        headers[col] = String(cell.value || "")
          .trim()
          .toLowerCase();
      });
      const rows: Record<string, string>[] = [];
      ws.eachRow((row: any, n: number) => {
        if (n === 1) return;
        const item: Record<string, string> = {};
        headers.forEach((h, col) => {
          if (h)
            item[h] = String(
              row.getCell(col).text ?? row.getCell(col).value ?? "",
            ).trim();
        });
        if (Object.values(item).some(Boolean)) rows.push(item);
      });
      if (!rows.length)
        throw new Error(
          "No user rows found. Fill the template and remove the example row.",
        );
      const required =
        mode === "create" ? ["username", "password", "flat"] : ["username"];
      const bad = required.filter((h) => !headers.includes(h));
      if (bad.length)
        throw new Error(`Missing required columns: ${bad.join(", ")}`);
      const ok = await openConfirm({
        title: `${mode === "create" ? "Import" : "Update"} ${rows.length} Flat User rows?`,
        message:
          mode === "create"
            ? "New Flat User accounts will be created. Existing usernames will be skipped; no existing account will be changed."
            : "Only existing Flat User accounts will be updated. Non-empty flat, phone and email cells replace existing values. Blank cells and passwords are ignored. No accounts are created, and Admin/Developer accounts are never changed.",
        confirmLabel: mode === "create" ? "Create users" : "Update users",
      });
      if (!ok) return;
      setReport(
        await call<ImportReport>(
          { action: "importFlatUsers", rows, mode },
          token,
        ),
      );
      await load();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!ready && !msg) return <LoadingState label="Loading…" />;
  const problems = report?.results?.filter(
    (r) => r.status !== "created" && r.status !== "updated",
  );
  return (
    <>
      <p className="muted">
        Two separate tools live here: <b>flat data</b> (apartment records:
        owner, type, area, contact details, exclusions) and <b>flat users</b>{" "}
        (resident login accounts). To edit a single flat, use{" "}
        {onOpenFlats ? (
          <button type="button" className="link-btn" onClick={onOpenFlats}>
            Flats
          </button>
        ) : (
          "Flats"
        )}
        . To manage Admin accounts or edit a single login, use{" "}
        {onOpenUsers ? (
          <button type="button" className="link-btn" onClick={onOpenUsers}>
            Users
          </button>
        ) : (
          "Users"
        )}
        .
      </p>
      {msg && <p className="err">{msg}</p>}

      <FlatDataImport flats={flats} onImportFlats={onImportFlats} />

      <div className="card">
        <h3>Bulk import Flat Users</h3>
        <p className="muted">
          1. Download the template. 2. Add one resident login per row. 3. Upload
          it here. Flats must already exist. Up to 500 rows per upload.
        </p>
        <div className="flat-import-mode" role="group" aria-label="Import mode">
          <label>
            <input
              type="radio"
              name="flat-user-import-mode"
              checked={mode === "create"}
              onChange={() => {
                setMode("create");
                setReport(null);
              }}
            />{" "}
            Create new users only
          </label>
          <label>
            <input
              type="radio"
              name="flat-user-import-mode"
              checked={mode === "update"}
              onChange={() => {
                setMode("update");
                setReport(null);
              }}
            />{" "}
            Update existing users
          </label>
        </div>
        <p className="muted">
          {mode === "create"
            ? "Username, password and flat are required. Existing usernames are skipped and never overwritten."
            : "Username is required. Non-empty flat, phone and email cells update matching Flat User accounts. Blank cells leave existing values unchanged. Passwords, roles and sessions are never changed. Unknown usernames are skipped."}
        </p>
        <div className="flat-import-actions">
          <button type="button" onClick={() => void downloadTemplate()}>
            Download Excel template
          </button>
          <label
            className="btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Processing…" : "Upload Excel file"}
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {report && (
          <div className="flat-import-report">
            <strong>
              {report.mode === "update" ? "Update results" : "Import results"}
            </strong>
            <p>
              Created: {report.created || 0} · Updated: {report.updated || 0} ·
              Skipped: {report.skipped} · Errors: {report.errors}
            </p>
            {!!problems?.length && (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Username</th>
                      <th>Result</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((r, i) => (
                      <tr key={`${r.row}-${i}`}>
                        <td>{r.row}</td>
                        <td>{r.username}</td>
                        <td>{r.status}</td>
                        <td>{r.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div
          className="row"
          style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Login accounts by flat</h3>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {flats.length - withoutLogin} of {flats.length} flats have a login
              {withoutLogin ? ` · ${withoutLogin} without one` : ""}
            </p>
          </div>
          <label
            className="opt"
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            <span>Show only flats without a login</span>
          </label>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Flat</th>
                <th>Owner</th>
                <th>Login accounts</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const names = byFlat.get(f.flat);
                return (
                  <tr key={f.flat}>
                    <td>
                      <b>{f.flat}</b>
                    </td>
                    <td>{f.name || "—"}</td>
                    <td>
                      {names ? (
                        names.join(", ")
                      ) : (
                        <span className="muted">No login yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={3} className="muted">
                    Every flat has a login account.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
