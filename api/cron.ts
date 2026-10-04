import { init } from "../server/db.js";
import { runDaily } from "../server/jobs.js";
import type { Req, Res } from "../server/types";

// Called once a day by Vercel Cron (see vercel.json). CRON_SECRET is mandatory; fail closed if missing.
export default async function handler(req: Req, res: Res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "CRON_SECRET is not configured; refusing to run scheduled jobs.",
    );
    return res.status(503).json({ error: "Scheduled jobs are not configured" });
  }
  if (req.headers.authorization !== `Bearer ${secret}`)
    return res.status(401).json({ error: "Unauthorized" });
  if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL))
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  try {
    await init();
    res.json({ ok: true, ...(await runDaily()) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Job failed" });
  }
}
