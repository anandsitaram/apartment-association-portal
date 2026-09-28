import { PGlite } from "@electric-sql/pglite";

// One in-memory Postgres shared by the whole test run; mimics neon().query(text, params) -> rows
const db = (globalThis.__pg ||= new PGlite());
export const neon = () => ({
  query: async (text, params) => (await db.query(text, params)).rows,
});
