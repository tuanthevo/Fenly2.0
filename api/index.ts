/**
 * Vercel Function entry point for every /api/* route.
 *
 * vercel.json rewrites /api/(.*) to this single function, and the Express app in
 * server/app.ts routes each request by its original path. Shared code lives outside
 * api/ on purpose: Vercel turns every file in api/ into its own function.
 *
 * Set GEMINI_API_KEY in Vercel > Project > Settings > Environment Variables.
 * It stays on the server and is never bundled into the browser.
 */
import app from "../server/app.js";

export default app;
