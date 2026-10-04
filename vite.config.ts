import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Local dev only: runs api/app.js inside the Vite dev server and loads .env.local,
// so `npm run dev` serves the front end and the API together (no Vercel CLI needed).
const localApi = (): Plugin => ({
  name: "local-api",
  configureServer(server) {
    Object.assign(process.env, loadEnv("development", process.cwd(), ""));
    server.middlewares.use("/api/app", async (rq, rs) => {
      // the API handler expects an Express-like request / response
      const req = rq as IncomingMessage & { body?: unknown };
      const res = rs as ServerResponse & {
        status: (code: number) => typeof res;
        json: (body: unknown) => void;
      };
      let raw = "";
      for await (const c of req) raw += c;
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
      res.status = (c: number) => ((res.statusCode = c), res);
      res.json = (o: unknown) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(o));
      };
      try {
        const { default: handler } = await server.ssrLoadModule("/api/app.ts");
        await handler(req, res);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  },
});

export default defineConfig({ plugins: [react(), localApi()] });
