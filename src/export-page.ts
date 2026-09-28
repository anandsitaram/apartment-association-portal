import type { Data, Settings } from "../shared/types";
import { download, exportSummary } from "./export.js";
import { buildSummary } from "./lib.js";
import { call } from "./api.js";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fileStem = (settings?: Pick<Settings, "orgName" | "orgShort">) =>
  (settings?.orgShort || settings?.orgName || "Maintenance")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Maintenance";

const scalar = (value: unknown): string | number | boolean => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
};

const rowsFrom = (rows: Record<string, unknown>[]) => {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return { keys, rows: rows.map((r) => keys.map((k) => scalar(r[k]))) };
};

const addSheet = (wb: any, name: string, rows: Record<string, unknown>[]) => {
  const ws = wb.addWorksheet(name.slice(0, 31));
  const { keys, rows: values } = rowsFrom(rows);
  if (!keys.length) {
    ws.addRow(["No records"]);
    return;
  }
  ws.addRow(
    keys.map((k) =>
      k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    ),
  );
  for (const row of values) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: "A1",
    to: `${String.fromCharCode(64 + Math.min(keys.length, 26))}1`,
  };
  for (const col of ws.columns) {
    let max = 12;
    col.eachCell({ includeEmpty: false }, (cell: any) => {
      max = Math.min(42, Math.max(max, String(cell.value ?? "").length + 2));
    });
    col.width = max;
  }
};

export async function exportCurrentPage(
  section: string,
  data: Data,
  token?: string,
) {
  // the Months screen only loads one month's payments; export needs all of them
  if (data.paymentsMonth)
    data = await call<Data>(undefined, token, "dashboard");
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  const stamp = new Date().toISOString().slice(0, 10);
  let title = section;

  switch (section) {
    case "dashboard":
      title = "Dashboard";
      addSheet(
        wb,
        "Months",
        data.months as unknown as Record<string, unknown>[],
      );
      addSheet(wb, "Flats", data.flats as unknown as Record<string, unknown>[]);
      addSheet(
        wb,
        "Party Hall",
        data.hallBookings as unknown as Record<string, unknown>[],
      );
      addSheet(
        wb,
        "Gym",
        data.gymBookings as unknown as Record<string, unknown>[],
      );
      addSheet(
        wb,
        "Tickets",
        data.tickets as unknown as Record<string, unknown>[],
      );
      break;
    case "months":
      title = "Months";
      addSheet(
        wb,
        "Months",
        data.months as unknown as Record<string, unknown>[],
      );
      addSheet(
        wb,
        "Payments",
        data.payments as unknown as Record<string, unknown>[],
      );
      addSheet(wb, "Flats", data.flats as unknown as Record<string, unknown>[]);
      break;
    case "flats":
      title = "Flats";
      addSheet(wb, "Flats", data.flats as unknown as Record<string, unknown>[]);
      break;
    case "summary": {
      const summary = buildSummary(data, data.flats);
      await exportSummary({
        summary,
        settings: data.settings,
        admin: true,
        hide: false,
      });
      return;
    }
    case "corpus":
      title = "Corpus Fund";
      addSheet(
        wb,
        "Ledger",
        data.corpusLedger as unknown as Record<string, unknown>[],
      );
      break;
    case "hall":
      title = "Party Hall";
      addSheet(
        wb,
        "Bookings",
        data.hallBookings as unknown as Record<string, unknown>[],
      );
      break;
    case "gym":
      title = "Gym Booking";
      addSheet(
        wb,
        "Bookings",
        data.gymBookings as unknown as Record<string, unknown>[],
      );
      break;
    case "tickets":
      title = "Tickets";
      addSheet(
        wb,
        "Tickets",
        data.tickets as unknown as Record<string, unknown>[],
      );
      break;
    case "polls": {
      title = "Polls";
      addSheet(wb, "Polls", data.polls as unknown as Record<string, unknown>[]);
      const pollResults = data.polls.flatMap((poll) =>
        poll.options.map((option, index) => ({
          poll_id: poll.id,
          poll_title: poll.title,
          status: poll.status,
          option,
          votes: poll.tally[index] || 0,
          total_votes: poll.totalVotes,
          created_by: poll.created_by,
          created_at: poll.created_at,
          closes_at: poll.closes_at || "",
        })),
      );
      addSheet(wb, "Poll Results", pollResults);
      break;
    }
    case "notifications": {
      title = "Notifications";
      const result = await call<{ logs?: Record<string, unknown>[] }>(
        { action: "listNotificationLogs", limit: 10000 },
        token,
      );
      addSheet(
        wb,
        "Delivery Logs",
        (result.logs || data.notificationLogs || []) as unknown as Record<
          string,
          unknown
        >[],
      );
      break;
    }
    case "settings":
      title = "Settings";
      addSheet(
        wb,
        "Settings",
        Object.entries(data.settings).map(([key, value]) => ({ key, value })),
      );
      break;
    case "users": {
      title = "Users";
      const result = await call<{ users?: Record<string, unknown>[] }>(
        { action: "listUsers" },
        token,
      );
      addSheet(wb, "Users", result.users || []);
      break;
    }
    case "audit": {
      title = "Audit Logs";
      const result = await call<{ entries?: Record<string, unknown>[] }>(
        { action: "listAudit", limit: 5000 },
        token,
      );
      addSheet(wb, "Audit Logs", result.entries || []);
      break;
    }
    case "mymaintenance":
      title = "My Maintenance";
      addSheet(
        wb,
        "Payments",
        data.payments.filter(
          (p) => !data.mine || p.flat === data.mine,
        ) as unknown as Record<string, unknown>[],
      );
      break;
    case "backups": {
      title = "Backups";
      const result = await call<{ backups?: Record<string, unknown>[] }>(
        { action: "listBackups" },
        token,
      );
      addSheet(
        wb,
        "Backup Index",
        (result.backups || []).map((b) => ({
          ...b,
          size_kb: Math.ceil(Number(b.size || 0) / 1024),
        })),
      );
      addSheet(wb, "Current Data", [
        {
          exported_at: new Date().toISOString(),
          months: data.months.length,
          flats: data.flats.length,
          payments: data.payments.length,
          corpus_ledger_entries: data.corpusLedger.length,
        },
      ]);
      break;
    }
    default:
      addSheet(wb, "Data", data.months as unknown as Record<string, unknown>[]);
  }

  if (wb.worksheets.length === 0) addSheet(wb, "Data", []);
  download(
    new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }),
    `${fileStem(data.settings)}_${title.replace(/\s+/g, "_")}_${stamp}.xlsx`,
  );
}
