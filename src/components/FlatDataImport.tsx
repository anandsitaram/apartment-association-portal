import { useState } from "react";
import type { Flat } from "../../shared/types";
import { openConfirm } from "./ui/appDialog.js";

async function exportFlatData(flats: Flat[]) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Flat Data");
  ws.columns = [
    { header: "flat", key: "flat", width: 18 },
    { header: "block", key: "block", width: 12 },
    { header: "name", key: "name", width: 28 },
    { header: "type", key: "type", width: 16 },
    { header: "bua", key: "bua", width: 14 },
    { header: "uds", key: "uds", width: 14 },
    { header: "phone", key: "phone", width: 18 },
    { header: "email", key: "email", width: 30 },
    { header: "excluded", key: "excluded", width: 16 },
    { header: "corpexcluded", key: "corpexcluded", width: 18 },
  ];
  for (const f of flats) {
    ws.addRow({
      flat: f.flat,
      block: f.block || "",
      name: f.name || "",
      type: f.type || "",
      bua: f.bua,
      uds: f.uds,
      phone: f.phone || "",
      email: f.email || "",
      excluded: f.excluded ? "TRUE" : "FALSE",
      corpexcluded: f.corp_excluded ? "TRUE" : "FALSE",
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "J1" };
  const guide = wb.addWorksheet("Instructions");
  guide.addRows([
    ["Cedar Grove Residences — Flat Data Export"],
    [
      "This workbook contains flat master records only; it does not include resident login accounts, payments, or month history.",
    ],
    [
      "You can upload this workbook through Flat User Management > Bulk import flat data.",
    ],
    [
      "Use Update existing flats to update matching records. A non-empty block updates the block. Blank cells are left unchanged in update mode.",
    ],
    ["Do not share this file publicly; it may contain owner contact details."],
  ]);
  guide.getColumn(1).width = 110;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cedar-grove-flat-data-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadFlatTemplate() {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Flat Data");
  ws.columns = [
    { header: "flat", key: "flat", width: 18 },
    { header: "block", key: "block", width: 12 },
    { header: "name", key: "name", width: 28 },
    { header: "type", key: "type", width: 16 },
    { header: "bua", key: "bua", width: 14 },
    { header: "uds", key: "uds", width: 14 },
    { header: "phone", key: "phone", width: 18 },
    { header: "email", key: "email", width: 30 },
    { header: "excluded", key: "excluded", width: 16 },
    { header: "corpexcluded", key: "corpexcluded", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const guide = wb.addWorksheet("Instructions");
  [
    ["Bulk Flat Data Import"],
    ["Use the Flat Data sheet. Enter one flat per row."],
    [
      "Columns: flat (required for all modes), block, name, type, bua (Sq Ft), uds, phone, email, excluded, corpExcluded. Block is optional (e.g. A or C).",
    ],
    [
      "Create mode: flat and bua are required. Existing flat numbers are skipped. SL is assigned automatically. Use block to group flats by building block (e.g. A or C).",
    ],
    [
      "Update mode: flat identifies an existing flat. Non-empty values update that flat; blank cells are left unchanged.",
    ],
    [
      "For excluded and corpExcluded, use TRUE or FALSE. Leave blank in update mode to preserve the current setting.",
    ],
    [
      "Phone and email are optional. Do not include payment amounts or month-specific data in this file.",
    ],
    [
      "Import does not create resident login accounts. Use Bulk import Flat Users on the Flat User Management page for login accounts.",
    ],
    [
      "Maximum 500 rows per upload. Review the import report for skipped or invalid rows.",
    ],
  ].forEach((r) => guide.addRow(r));
  guide.getColumn(1).width = 115;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cedar-grove-flat-data-template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

// Bulk import / export of flat records (apartment data). Login accounts are handled separately on this page.
export default function FlatDataImport({
  flats,
  onImportFlats,
}: {
  flats: Flat[];
  onImportFlats: (
    rows: Record<string, string>[],
    mode: "create" | "update",
  ) => Promise<any>;
}) {
  const [flatImportBusy, setFlatImportBusy] = useState(false);
  const [flatImportMode, setFlatImportMode] = useState<"create" | "update">(
    "create",
  );
  const [flatImportReport, setFlatImportReport] = useState<any>(null);
  const [flatImportMessage, setFlatImportMessage] = useState("");

  const importFlatFile = async (file?: File) => {
    if (!file || !onImportFlats) return;
    setFlatImportBusy(true);
    setFlatImportReport(null);
    setFlatImportMessage("");
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.getWorksheet("Flat Data") || wb.worksheets[0];
      if (!ws) throw new Error("The workbook has no worksheet");
      const headers: string[] = [];
      ws.getRow(1).eachCell((cell: any, col: number) => {
        headers[col] = String(cell.value || "")
          .trim()
          .toLowerCase();
      });
      const rows: Record<string, string>[] = [];
      ws.eachRow((row: any, rowNum: number) => {
        if (rowNum === 1) return;
        const item: Record<string, string> = {};
        headers.forEach((header, col) => {
          if (header)
            item[header] = String(
              row.getCell(col).text ?? row.getCell(col).value ?? "",
            ).trim();
        });
        if (Object.values(item).some(Boolean)) rows.push(item);
      });
      if (!rows.length)
        throw new Error("No flat data rows found in the workbook.");
      if (rows.length > 500)
        throw new Error("Import is limited to 500 rows at a time.");
      const required = flatImportMode === "create" ? ["flat", "bua"] : ["flat"];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length)
        throw new Error(`Missing required columns: ${missing.join(", ")}`);
      const message =
        flatImportMode === "create"
          ? "New flat records will be created. Existing flat numbers will be skipped. No resident login accounts or payment records will be created."
          : "Existing flat records matching flat number will be updated. Blank cells will be left unchanged. Payment records and historical month values will not be imported.";
      if (
        !(await openConfirm({
          title: `${flatImportMode === "create" ? "Import" : "Update"} ${rows.length} flat records?`,
          message,
          confirmLabel:
            flatImportMode === "create" ? "Create flats" : "Update flats",
        }))
      )
        return;
      const report = await onImportFlats(rows, flatImportMode);
      setFlatImportReport(report);
    } catch (e) {
      setFlatImportMessage(
        e instanceof Error ? e.message : "Unable to import flat data",
      );
    } finally {
      setFlatImportBusy(false);
    }
  };
  return (
    <div className="card no-print flat-bulk-import">
      <h3>Bulk import flat data</h3>
      <p className="muted">
        Import apartment records such as flat number, owner name, apartment
        type, square feet, UDS, phone, email and maintenance/Corpus Fund
        exclusions. This creates or updates flat records, not login accounts
        (use Bulk import Flat Users below for those). Up to 500 rows per upload.
      </p>
      <div
        className="flat-import-mode"
        role="group"
        aria-label="Flat data import mode"
      >
        <label>
          <input
            type="radio"
            name="flat-data-import-mode"
            checked={flatImportMode === "create"}
            onChange={() => {
              setFlatImportMode("create");
              setFlatImportReport(null);
            }}
          />{" "}
          Create new flats only
        </label>
        <label>
          <input
            type="radio"
            name="flat-data-import-mode"
            checked={flatImportMode === "update"}
            onChange={() => {
              setFlatImportMode("update");
              setFlatImportReport(null);
            }}
          />{" "}
          Update existing flats
        </label>
      </div>
      <p className="muted">
        {flatImportMode === "create"
          ? "Existing flat numbers are skipped. Flat number and Sq Ft are required; SL is assigned automatically."
          : "Flat number identifies the record. Non-empty cells update the existing flat; blank cells are left unchanged. Payments and historical month values are not imported or overwritten."}
      </p>
      <div className="row-actions flat-import-actions">
        <button type="button" onClick={() => void downloadFlatTemplate()}>
          Download flat data template
        </button>
        <button type="button" onClick={() => void exportFlatData(flats)}>
          Export current flat data
        </button>
        <label
          className="btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: flatImportBusy ? "wait" : "pointer",
          }}
        >
          {flatImportBusy ? "Processing…" : "Upload flat data Excel"}
          <input
            type="file"
            accept=".xlsx"
            disabled={flatImportBusy}
            style={{ display: "none" }}
            onChange={(e) => {
              void importFlatFile(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {flatImportMessage && <p className="err">{flatImportMessage}</p>}
      {flatImportReport && (
        <div className="flat-import-report">
          <strong>
            {flatImportReport.mode === "update"
              ? "Flat update results"
              : "Flat import results"}
          </strong>
          <p>
            Created: {flatImportReport.created || 0} · Updated:{" "}
            {flatImportReport.updated || 0} · Skipped:{" "}
            {flatImportReport.skipped || 0} · Errors:{" "}
            {flatImportReport.errors || 0}
          </p>
          {flatImportReport.results?.some(
            (r: any) => r.status !== "created" && r.status !== "updated",
          ) && (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Flat No</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {flatImportReport.results
                    .filter(
                      (r: any) =>
                        r.status !== "created" && r.status !== "updated",
                    )
                    .map((r: any, i: number) => (
                      <tr key={`${r.row}-${i}`}>
                        <td>{r.row}</td>
                        <td>{r.flat}</td>
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
  );
}
