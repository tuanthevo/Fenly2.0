# Fenly: notes for Claude Code

Fenly (the UI brand reads "Fenn") is a vertical-video room-rental app exported from Google AI Studio and now developed locally on Windows.

## Stack and layout
- Frontend: React 19 + Vite 8 + Tailwind 4 in `src/`. Main screens in `src/App.tsx`, components in `src/components/`, shared logic in `src/utils/trustSafety.ts`. Listings are mock data held in React state (`src/data/mockRooms.ts`); there is no database yet.
- API: one Express app in `server/app.ts` holds every `/api/*` route. `server/gemini.ts` has the shared Gemini client and the model IDs.
- Local runner: `server.ts` (`npm run dev`) serves the API and the Vite dev server on http://localhost:3000. Hot reload is off: refresh the browser after frontend edits, and restart the server after editing `server/` or `.env.local`.
- Vercel: `api/index.ts` exposes the same Express app as one function; `vercel.json` pins the Vite preset and rewrites `/api/*` to it. Vercel caps request bodies at 4.5 MB, so media is never posted through `/api`: upload it to storage and send references.

## Commands (Windows; in PowerShell use npm.cmd / npx.cmd)
- `npm run dev`: app + API on port 3000
- `npm run lint`: TypeScript check (`tsc --noEmit`)
- `npm run build`: production build; it fails if the Gemini key would leak into the browser bundle
- `npx tsx --test src/utils/trustSafety.test.ts`: unit tests

## Rules
- Don't change existing pages, brand colors, layout, or features unless the task asks for it. Reuse the existing palette and component styles.
- Secrets live only in `.env.local` (gitignored) and are read on the server: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Never print them, never commit them, never give them a `VITE_` prefix. `VITE_GOOGLE_MAPS_API_KEY` is a public, referrer-restricted browser key.
- Gemini: follow the `gemini-api-dev` skill in `.claude/skills/` and fetch the doc pages it lists before writing Gemini code. Keep model IDs in `server/gemini.ts`. For `gemini-3.8-flash`, the thinking level must be low, medium or high (never `minimal`, never `thinking_budget`), and don't send temperature, top_p, top_k or candidate_count. Use structured JSON output with a schema for anything the UI parses.
- Put every new backend route in `server/app.ts` (or a module it registers) so it works locally and on Vercel.
- Git: commit checkpoints with clear messages and stage with `git add -A -- . ':!.aistudio'`. The AI Studio screenshots in `.aistudio/` show as modified because a C2PA tag was added when they were copied; never commit those changes. Never commit `.env*` files except `.env.example`.

## Viral video editor (Remotion)
- What it does: turns the 5 guided shots (7 s each) into a 1080x1920 short: a 30-45 s full tour (hook, listing facts, up to ~7 s per room with speed ramps and two callouts, slow-motion perk reveal, price question, seamless loop). Rooms shrink to their clean footage, so short or messy clips give shorter tours.
- Create Listing makes the choices: price hook (headline text editable), full tour, balanced pace, automatic lighting (`look.ts` `autoLook`), no sound effects or room sound. Music is switched off for now (`MUSIC_ENABLED = false` in `ViralVideoEditor.tsx`); the AI music code (`POST /api/viral/music`, `musicMood.ts`, `aiMusic.ts`: a song the host likes -> mood -> original Lyria instrumental) stays in place for later. The edit screen (`EditListingModal`, from Home > Landlord > Active Room Listing: swipe left on phones, Edit button on computers) re-opens a listing's saved edit (`RoomListing.viralEdit`: clips, analysis, AI copy, settings) with hook style, length, pace, lighting presets and sliders, sound, music and a typed AI box. Typed requests are understood locally first (`editSettings.ts` `localEditPatch`); the rest go to `POST /api/viral/edit` (text only, flash-lite, minimal thinking). Section timing, speeds and sources: `docs/viral-playbook.md`. Build brief: `docs/briefs/viral-remotion-editor.md`.
- Dev server: `npm run dev` runs `tsx watch`, so it restarts when server code changes; live reload shares port 3000 (`DISABLE_HMR=true` turns it off). The editor is lazy-loaded, so every `remotion` / `@remotion/*` import path must be listed in `optimizeDeps.include` in `vite.config.ts`, or the first open re-bundles React mid-session and the page goes blank.
- Code: `src/remotion/viral/`. `plan.ts` builds a JSON edit plan (pure, unit tested); `FenlyViralTour.tsx` renders it. `src/components/ViralVideoEditor.tsx` shows it in `@remotion/player` and exports MP4 in the browser with `@remotion/web-renderer` (no render server, works on Vercel). Studio entry: `src/remotion/index.ts`.
- Load the `remotion-*` skills in `.claude/skills/` before editing Remotion code. Keep every `remotion` / `@remotion/*` package on the same exact version.
- Editing quality: before changing or judging how the video looks or feels (hook, length, speed, cuts, fonts, text size and placement, reading time, color, sound), load the `fenly-viral-editor` skill. It brings in `short-form-video` and `caption-animation` (installed from iart-ai/tiktok-video-skills, pinned in `skills-lock.json`), and its `references/audit.md` scores a render frame by frame. Audit a real render before and after every change.
- Composition code uses inline styles (no Tailwind), brand tokens from `src/remotion/viral/theme.ts`, and keeps all text inside `SAFE` so platform UI never covers it. No emoji in burned-in text. No CSS `filter` in the composition (unsupported by client-side rendering in Safari); use `@remotion/effects`.
- Tests: `npx tsx --test src/remotion/viral/*.test.ts`. Change timing rules in `plan.ts` only together with its tests.
- Never commit the host's clips (`public/samples/`) or renders (`out/`).
