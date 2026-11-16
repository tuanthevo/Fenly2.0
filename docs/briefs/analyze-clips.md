# Task: Gemini filming coach and viral editor (`/api/analyze-clips`)

Read `CLAUDE.md` first. Work through the steps in order. Check in with me only where a step says to, and finish with a test report and a commit.

## 0. Skills: Claude Code only
The 13 Remotion skills live in `.agents/skills/`, with symlinks from `.claude/skills/` and `.grok/skills/`. Make every skill a real copy under `.claude/skills/` and remove the other agent folders:
1. `npx skills remove <the 13 remotion-* names listed in skills-lock.json> -y`. This CLI version rejects `--agent '*'`; with no `--agent` it removes the skill from every agent.
2. `npx skills add remotion-dev/skills -a claude-code --copy -y --skill <the same 13 names>`.
3. Delete the now-empty `.agents`, `.grok`, `.posit` and `.tabnine` folders. Leave `.claude/skills/gemini-api-dev` untouched.
4. Confirm `.claude/skills/` holds 14 real folders and no symlinks remain.

## 1. Setup
- `.env.local` must contain `GEMINI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Check that they are present without printing their values. If any is missing, stop and ask me.
- Update `@google/genai` to the latest release. The skill asks for >= 3.2.0 and 2.32.0 is installed, so this is a major upgrade: read `.claude/skills/gemini-api-dev/references/migration.md` and the SDK release notes, then run lint and smoke-test every existing `/api` route so nothing regresses. Don't migrate existing routes to new APIs unless the upgrade forces it, and tell me what changed.
- Install `@supabase/supabase-js` for server use only.
- Use `gemini-3.8-flash` as requested, even though the skill's model list now leads with newer models such as `gemini-4-hydrogen`. Don't switch models without asking me.

## 2. Clip storage (Supabase, signed by the server)
- `server/supabase.ts`: a server-only client built from `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- Make sure a private bucket named `raw-clips` exists. Create it with the secret key if it's missing, limited to video MIME types and 50 MB per file.
- `POST /api/clip-uploads`: return a signed upload URL or token per slot (`createSignedUploadUrl`) for paths like `drafts/<draftId>/slot-<n>-<timestamp>.<ext>`. The browser uploads each clip straight to Supabase with it. No Supabase keys and no public bucket policies in the browser.

## 3. `POST /api/analyze-clips`
Input: the listing context from the Create Listing form (monthly rent, neighborhood, city, room type, beds, baths, amenities) plus the 5 clips (`slotIndex` 1-5, slot title, storage path, MIME type).

Build it on the Interactions API, as the skill recommends, unless the docs show that a feature you need (video files, per-video fps, structured output) is only available on `generateContent`.

For each clip, create a signed read URL (the clip's Supabase `raw-clips` URL), fetch the video, upload it with the Gemini Files API, and poll until the file is ACTIVE. Time out, and fail with a clear error, if a file fails processing. Then send all 5 videos to `gemini-3.8-flash` in one request with:
- custom video processing at `fps: 4` for every clip, overriding the 1 FPS default so a 4-second clip gives the model 16 frames to judge camera shake. Take the exact field name from the Video Understanding docs;
- thinking level `low`. No `minimal`, no `thinking_budget`, no sampling parameters;
- strict JSON structured output (with a schema) that inspects lighting, stability and framing across all clips.

Delete every temporary Gemini file in a `finally` block, whether the analysis succeeds or fails.

Validate and clamp the model's answer on the server, then return:
- `qualityWarnings`: `[{ slotIndex, tip }]`. Beginner-friendly retake tips ONLY when a clip is genuinely too dark, blurry, sideways or pointed at a blank wall, e.g. `{ slotIndex: 2, tip: "Bathroom clip is too dark—flip the vanity light on for a quick 4s retake!" }`. An empty array when every clip is fine.
- `orderedClips`: all 5 clips, reordered. Position 1 is the room clip with the brightest light and smoothest forward walk (the 0-2 s viral hook), followed by a logical tour progression. Each entry has `slotIndex`, `clipUrl`, `startSec` and `endSec` (trimmed to the cleanest 1.4-1.8 s of smooth forward movement, cutting off start and stop shake), `speedMultiplier` (1.0 for hero shots, 1.35 for transitions) and `calloutTag` (2-3 punchy words like "Private Bath" or "In-Unit W/D").
- `hookText`: curiosity-gap text for seconds 0-2 using the real rent and neighborhood, e.g. "What $1,250/mo gets you in Mission District".
- `socialCaption`: Line 1 a polarizing price-debate question, Line 2 scannable specs, Line 3 a friend-share call to action, plus exactly 5 hashtags for TikTok, Reels, Shorts and Snapchat.

Keep the existing `/api/gemini/viral-home-tour` route working as the fallback. Make sure the route finishes well inside Vercel's function time limit (set `maxDuration` for `api/index.ts` in `vercel.json` if needed).

## 4. UI: Guided Viral Home Tour Studio
In `src/components/GuidedViralTourStudio.tsx` (opened from `PostRoomModal`):
- As soon as all 5 Guided Shot Cards have a clip, upload them with per-card progress and call `/api/analyze-clips` using the listing's real form values.
- Show each quality warning on its own card with a one-tap **Quick Retake** button. On phones it reopens the smart camera for that slot (`handleOpenSmartCamera`); on desktop it opens that slot's file picker. A retake replaces the clip, re-uploads it and re-runs the analysis.
- Before the preview step, show the editable hook text and one editable room tag per clip, prefilled from the analysis.
- Fenly has no Remotion yet, so the "preview step" is the existing 9:16 Viral Tour Preview player. Feed it `orderedClips` (order, trims, speeds, tags) and the edited hook text, and keep the data shape easy to hand to a Remotion composition later. Don't add Remotion in this task.
- Show the social caption with a copy button.
- Sample and demo clips must keep working: skip the coach for them or fall back to the current Gemini plan. If an upload or the analysis fails, show a friendly message and fall back the same way.
- Match the existing styles, colors and layout.

## 5. Test end to end locally, then commit
- `npm run lint`, the unit tests and `npm run build` must pass.
- With the dev server running (if port 3000 is already taken, use the running server or ask me to stop it), script a test that uploads 5 real clips through `/api/clip-uploads` and calls `/api/analyze-clips`. Ask me which files to use; candidates are `C:\Users\tuant\Downloads\IMG_3336.mov` to `IMG_3343.mov`. Check that the response matches the schema, trims are 1.4-1.8 s, there are exactly 5 hashtags, warnings appear only for real problems, and no files are left in the Gemini Files API afterwards.
- Then have me run the UI flow in the browser (record or upload 5 clips) and confirm the warnings, Quick Retake, the editable hook and tags, and the preview.
- Commit a checkpoint with `git add -A -- . ':!.aistudio'`, e.g. "Add Gemini filming coach: /api/analyze-clips with Supabase clip uploads". Never commit `.env.local`.
- Report what you changed, the test results, and anything you couldn't verify.
