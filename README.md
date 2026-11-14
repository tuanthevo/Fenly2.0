<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/7109b946-cd02-4ea0-bc40-f7555807d1a2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

The app and its API both run on http://localhost:3000. Check http://localhost:3000/api/health to confirm the API is up and a Gemini key is set.

## Project layout

- `src/`: React frontend (Vite). It reaches the backend only through relative `/api/...` URLs.
- `server/app.ts`: every `/api/*` route (Express). All Gemini calls happen here, server-side.
- `server/gemini.ts`: the shared Gemini client and model IDs (`gemini-3.8-flash`).
- `server.ts`: local runner for `npm run dev` (API + Vite dev server).
- `api/index.ts`: the same API, deployed as a single Vercel Function.

To add a backend route, add `app.post("/api/your-route", ...)` in `server/app.ts`. It works locally and on Vercel with no extra config.

## Keeping keys secret

`GEMINI_API_KEY` is read from `process.env` on the server and never reaches the browser. Only `VITE_*` variables are bundled into client code, and the Vite build fails if a Gemini key is given a `VITE_` name or its value appears in the bundle.

## Deploy to Vercel

1. Import the repository in Vercel. `vercel.json` already selects the Vite preset and routes `/api/*` to `api/index.ts`.
2. Add `GEMINI_API_KEY` (and `VITE_GOOGLE_MAPS_API_KEY` if you use Maps) under Project Settings → Environment Variables.
3. Deploy, then open `/api/health` on your deployment to confirm.

Vercel limits request bodies to 4.5 MB, so large photo uploads that work locally (up to 25 MB) need resizing before they are sent to `/api` in production.
