/**
 * Local / Node runner for Fenly (npm run dev, npm start).
 *
 * - Loads secrets from .env.local, then .env, into process.env (server side only).
 * - Serves every /api route from server/app.ts, the same app Vercel runs via api/index.ts.
 * - In development, mounts Vite in middleware mode for the React frontend.
 * - With NODE_ENV=production, serves the built dist/ folder instead.
 *
 * Vercel does not use this file: vercel.json pins the Vite preset and sends /api/* to api/index.ts.
 */
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import apiApp from "./server/app.js";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === "production";

// Setup Vite or static serving
async function startServer() {
  const app = express();

  // API routes first, so /api/* never falls through to the frontend.
  app.use(apiApp);
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    // Live reload runs over this same port. Without it the page never hears
    // Vite's "dependencies re-bundled, reload" message and can go blank.
    // AI Studio sets DISABLE_HMR=true, which turns it off completely.
    const liveReload = process.env.DISABLE_HMR !== "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: liveReload,
        ws: liveReload ? { server: httpServer } : false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Fenly full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
