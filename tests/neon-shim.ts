import { PGlite } from "@electric-sql/pglite";

// A worker keeps one database across module resets; setup.ts clears it between test files.
const db = (globalThis.__pg ||= new PGlite());
export async function resetTestDb() {
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
}
export const neon = () => ({
  query: async (text, params) => (await db.query(text, params)).rows,
});
