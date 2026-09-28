import { dump, restore, type BackupFile } from "./backup.js";
import { cleanUrl, driver, ensureSchema, useSsl } from "./db.js";
import type { Query, Row } from "./types";

// the slice of a node-postgres client (and of an ExcelJS cell) that the helpers use
interface PgClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}
interface Cell {
  value?: unknown;
}

// Helpers behind `npm run db` (scripts/db-tool.js): work on any Postgres given by URL, using the standard `pg` driver.
export async function withClient<T>(
  url: string,
  fn: (c: PgClient) => Promise<T>,
): Promise<T> {
  const { default: pg } = await import("pg");
  const c = new pg.Client({
    connectionString: cleanUrl(url),
    ssl: useSsl(url) ? { rejectUnauthorized: false } : false,
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const queryOf =
  (c: PgClient): Query =>
  async (text, params) =>
    (await c.query(text, params)).rows;

const excelText = (cell?: Cell): string => {
  const v = cell?.value as any;
  if (v == null) return "";
  if (typeof v === "object" && v.text != null) return String(v.text).trim();
  return String(v).trim();
};

const excelNumber = (cell?: Cell): number | null => {
  const v = cell?.value;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(
    String(v ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(n) ? n : null;
};

const headerKey = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[\n._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const firstColumn = (
  headers: Map<string, number>,
  names: string[],
): number | null => {
  for (const name of names) {
    const c = headers.get(headerKey(name));
    if (c) return c;
  }
  return null;
};

const selectionExcluded = (value: unknown) => {
  const v = headerKey(value);
  return ["excluded", "exclude", "no", "false", "0", "not included"].includes(
    v,
  );
};

interface FlatImport {
  flat: string;
  block: string;
  hasBlock: boolean;
  sl: number;
  name: string;
  type: string;
  bua: number;
  uds: number;
  phone?: string;
  email?: string;
  excluded: boolean | null;
  hasSelection: boolean;
  corpExcluded: boolean | null;
  hasCorpSelection: boolean;
}

// Read the flat master data from the standard payment-template sheet. The importer
// deliberately ignores rows without a positive BUA, so legacy template placeholders
// such as GYM / Parking,Motor & Lift are not accidentally created as flats.
export async function readFlatsFromWorkbook(file: string) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no worksheets");

  const headers = new Map<string, number>();
  for (let c = 1; c <= ws.columnCount; c++) {
    const key = headerKey(ws.getCell(19, c).value);
    if (key) headers.set(key, c);
  }
  const cols = {
    sl: firstColumn(headers, ["sl"]),
    name: firstColumn(headers, ["name"]),
    flat: firstColumn(headers, ["flat no", "flat"]),
    block: firstColumn(headers, ["block", "building block"]),
    type: firstColumn(headers, ["apt type", "type"]),
    bua: firstColumn(headers, ["bua", "sq ft", "sqft"]),
    uds: firstColumn(headers, ["uds"]),
    phone: firstColumn(headers, ["phone"]),
    email: firstColumn(headers, ["e mail", "email"]),
    selection: firstColumn(headers, [
      "maintenance selection",
      "maintenance included",
      "maint",
      "maintenance",
    ]),
    corpSelection: firstColumn(headers, [
      "corp fund selection",
      "corp fund included",
    ]),
  };
  if (!cols.flat || !cols.bua)
    throw new Error(
      "Could not find Flat No and BUA columns in row 19 of the workbook",
    );

  const out: FlatImport[] = [];
  const seen = new Set<string>();
  for (let r = 20; r <= Math.max(49, ws.rowCount); r++) {
    const flat = excelText(ws.getCell(r, cols.flat));
    const bua = excelNumber(ws.getCell(r, cols.bua));
    if (!flat || bua == null || !(bua > 0)) continue;
    if (seen.has(flat)) throw new Error(`Duplicate flat in workbook: ${flat}`);
    seen.add(flat);
    const sl: number =
      (cols.sl ? excelNumber(ws.getCell(r, cols.sl)) : r - 19) ?? r - 19;
    const uds = cols.uds ? excelNumber(ws.getCell(r, cols.uds)) : 0;
    const selection = cols.selection
      ? excelText(ws.getCell(r, cols.selection))
      : "";
    const corpSelection = cols.corpSelection
      ? excelText(ws.getCell(r, cols.corpSelection))
      : "";
    out.push({
      flat,
      block: cols.block ? excelText(ws.getCell(r, cols.block)) : "",
      hasBlock: !!cols.block,
      sl: Number.isInteger(sl) ? sl : Math.trunc(sl || r - 19),
      name: cols.name ? excelText(ws.getCell(r, cols.name)) : "",
      type: cols.type ? excelText(ws.getCell(r, cols.type)) : "",
      bua,
      uds: uds ?? 0,
      phone: cols.phone ? excelText(ws.getCell(r, cols.phone)) : undefined,
      email: cols.email ? excelText(ws.getCell(r, cols.email)) : undefined,
      excluded: cols.selection ? selectionExcluded(selection) : null,
      hasSelection: !!cols.selection,
      corpExcluded: cols.corpSelection
        ? selectionExcluded(corpSelection)
        : null,
      hasCorpSelection: !!cols.corpSelection,
    });
  }
  if (!out.length) throw new Error("No flat rows were found in rows 20-49");
  return out;
}

// Upsert flat master data from an Excel template. Existing phone/e-mail values are
// preserved when the source workbook has no contact columns (for example the original
// Sep 2026 template), while the maintenance selection is always explicit when present.
export async function importFlatsFrom(url: string, file: string) {
  const flats = await readFlatsFromWorkbook(file);
  return withClient(url, async (c) => {
    const query = queryOf(c);
    await ensureSchema(query, { rls: wantsRls(url) });
    await c.query("BEGIN");
    try {
      for (const f of flats) {
        await c.query(
          `INSERT INTO flats(flat,block,sl,name,type,bua,uds,phone,email,excluded,corp_excluded)
           VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8::text,''),COALESCE($9::text,''),$10,COALESCE($12::boolean,false))
           ON CONFLICT(flat) DO UPDATE SET
             block=CASE WHEN $14::boolean THEN $2 ELSE flats.block END,sl=$3,name=$4,type=$5,bua=$6,uds=$7,
             phone=CASE WHEN $8::text IS NULL THEN flats.phone ELSE $8::text END,
             email=CASE WHEN $9::text IS NULL THEN flats.email ELSE $9::text END,
             excluded=CASE WHEN $11::boolean THEN $10::boolean ELSE flats.excluded END,
             corp_excluded=CASE WHEN $13::boolean THEN COALESCE($12::boolean,false) ELSE flats.corp_excluded END`,
          [
            f.flat,
            f.block,
            f.sl,
            f.name,
            f.type,
            f.bua,
            f.uds,
            f.phone ?? null,
            f.email ?? null,
            f.excluded ?? false,
            f.hasSelection,
            f.corpExcluded ?? false,
            f.hasCorpSelection,
            f.hasBlock,
          ],
        );
      }
      await c.query("COMMIT");
      return { imported: flats.length, flats };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  });
}
// Supabase (and any non-Neon host) gets row-level security on every table
const wantsRls = (url: string) =>
  !/\.neon\.tech/i.test(url) && process.env.DB_RLS !== "off";

export const backupFrom = (
  url: string,
  { users = false }: { users?: boolean } = {},
) => withClient(url, (c) => dump(queryOf(c), { users }));

// Make sure the schema exists on `url`, then replace its data with `data`.
export const restoreInto = (url: string, data: BackupFile) =>
  withClient(url, async (c) => {
    await ensureSchema(queryOf(c), { rls: wantsRls(url) });
    await restore(c, data);
  });

// Copy everything (including user accounts) from one database to another, e.g. Neon -> Supabase.
export async function copyDb(sourceUrl: string, targetUrl: string) {
  const data = await backupFrom(sourceUrl, { users: true });
  await restoreInto(targetUrl, data);
  return Object.fromEntries(
    Object.entries(data.tables).map(([t, r]) => [t, r.length]),
  );
}
export { driver };
