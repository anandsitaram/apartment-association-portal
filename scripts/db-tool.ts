#!/usr/bin/env node
// Database helper. Usage (from the project folder):
//   npm run db -- backup [file]            save all data to a JSON file (default rv-fallon-backup-<date>.json)
//   npm run db -- restore <file> --yes     REPLACE the data in DATABASE_URL with the file's contents
//   npm run db -- copy --yes               copy everything from SOURCE_DATABASE_URL to DATABASE_URL (e.g. Neon -> Supabase)
// URLs come from the environment (or .env.local). Add --users to `backup` to include login accounts (password hashes).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { protectBackup, unprotectBackup } from "../server/backup.js";
import {
  backupFrom,
  copyDb,
  importFlatsFrom,
  restoreInto,
} from "../server/dbtool.js";

if (existsSync(".env.local"))
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (m && !(m[1] in process.env))
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }

const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const args = rest.filter((a) => !a.startsWith("--"));
const target = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const need = (v: string | undefined, name: string): string => {
  if (!v) {
    console.error(
      `${name} is not set (put it in .env.local or the environment)`,
    );
    process.exit(1);
  }
  return v;
};
const sure = () => {
  if (!flags.includes("--yes")) {
    console.error("This overwrites data. Re-run with --yes to confirm.");
    process.exit(1);
  }
};
const counts = (t: Record<string, number>) =>
  Object.entries(t)
    .map(([k, n]) => `${k}: ${n}`)
    .join(", ");

try {
  if (cmd === "backup") {
    const data = await backupFrom(need(target, "DATABASE_URL"), {
      users: flags.includes("--users"),
    });
    const file =
      args[0] ||
      `rv-fallon-backup-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(file, JSON.stringify(protectBackup(data), null, 1));
    console.log(
      `Saved encrypted ${file} (${counts(Object.fromEntries(Object.entries(data.tables).map(([k, r]) => [k, r.length])))})`,
    );
  } else if (cmd === "restore") {
    if (!args[0]) throw new Error("Usage: npm run db -- restore <file> --yes");
    sure();
    const parsed = JSON.parse(readFileSync(args[0], "utf8"));
    await restoreInto(need(target, "DATABASE_URL"), unprotectBackup(parsed));
    console.log("Restored", args[0]);
  } else if (cmd === "copy") {
    sure();
    const n = await copyDb(
      need(process.env.SOURCE_DATABASE_URL, "SOURCE_DATABASE_URL"),
      need(target, "DATABASE_URL"),
    );
    console.log("Copied:", counts(n));
  } else if (cmd === "import-flats") {
    if (!args[0])
      throw new Error(
        "Usage: npm run db -- import-flats <template.xlsx> --yes",
      );
    sure();
    const r = await importFlatsFrom(need(target, "DATABASE_URL"), args[0]);
    console.log(`Imported ${r.imported} flat master records from ${args[0]}`);
  } else {
    console.error(
      "Commands: backup [file] | restore <file> --yes | copy --yes | import-flats <xlsx> --yes",
    );
    process.exit(1);
  }
} catch (e) {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
