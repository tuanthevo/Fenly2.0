# Brief: Remotion viral room-tour editor (for Claude Code)

## Goal

Someone who has never posted short-form video records the 5 guided shots on
their phone, and Fenly edits them into a vertical short (TikTok / Reels /
Shorts) that follows what actually performs for rental videos: price +
neighborhood hook on frame 0, fast cuts, room callouts, a payoff, a price
question and a seamless loop. They preview it, tweak the words, export an MP4
in the browser, share it, and attach it to the listing.

Today Step 3 (`GuidedViralTourStudio`) only swaps clips in one `<video>` at
0.75x slow motion with small text. Replace that experience with the new
Remotion editor. The research behind every rule is in `docs/viral-playbook.md`.

## Already in the repo (written and tested outside this machine)

```
src/remotion/index.ts, src/remotion/Root.tsx      Studio / CLI entry (composition "FenlyViralTour")
src/remotion/viral/types.ts                        plan types (plain JSON)
src/remotion/viral/plan.ts (+ plan.test.ts)        clips + listing -> edit plan (timing, order, trims, copy, sfx)
src/remotion/viral/copy.ts (+ copy.test.ts)        hooks, callouts, end card, caption, fair-housing guard
src/remotion/viral/clipSignals.ts (+ test)         local "filming coach": best 1.6 s window, exposure fix, warnings
src/remotion/viral/fixtures/clip-samples.json      signals measured from 8 real phone clips (numbers only)
src/remotion/viral/analyzeClipInBrowser.ts         samples a clip in the browser (<video> + canvas)
src/remotion/viral/FenlyViralTour.tsx              the composition
src/remotion/viral/overlays.tsx, transitions.tsx   text layers, whip / zoom / light-leak cuts
src/remotion/viral/theme.ts, fonts.ts, sfx.ts      brand tokens + safe zone, Plus Jakarta Sans, sound paths
src/remotion/viral/sample.ts                       sample plan for Studio
src/remotion/viral/exportVideo.ts                  renderMediaOnWeb export, share / download
src/components/ViralVideoEditor.tsx                Step 3 UI: analysis, <Player>, styles, pace, callouts, export
public/sfx/whoosh.wav, pop.wav, ding.wav           original synthesized sound effects
remotion.config.ts                                 Studio / CLI config (entry point, ANGLE for WebGL effects)
```

How it was checked: 32 unit tests pass (`npx tsx --test src/remotion/viral/*.test.ts`);
strict type check against stand-in typings written from the installed
remotion skills (v4.0.543), not the real packages; every frame of 6 plan
variants rendered through a mock Remotion runtime with no errors; and a
preview made from the host's own clips. Expect a few type fixes against the
real packages. That's normal, keep the behavior.

The preview is at `../fenn-viral-tour-preview.mp4` (in Downloads, outside the
repo, because it shows the inside of the user's home). It is a mock render:
CSS filters instead of the WebGL grade, a glow instead of the light leak,
Inter instead of Plus Jakarta Sans. Use it as the visual target.

## Rules (from CLAUDE.md, repeated)

- Don't change other pages, brand colors, layout or features beyond what's below.
- Secrets stay in `.env.local`, server-side only. Never print, commit or `VITE_`-prefix them.
- Commit with `git add -A -- . ':!.aistudio'`; never commit `.env*`, `public/samples/` or `out/`.
- Load the remotion skills (`.claude/skills/remotion-*`) before touching Remotion code.

## Steps

### 0. Branch
`git switch -c feat/viral-remotion-editor` (from the current `feat/guided-5-shot-capture` HEAD).
Append `public/samples/` and `out/` to `.gitignore`.

### 1. Install Remotion (one version for every package, no `^`)
```
npm i --save-exact remotion @remotion/player @remotion/media @remotion/transitions @remotion/effects @remotion/google-fonts @remotion/web-renderer
npm i -D --save-exact @remotion/cli
npx remotion versions
```
All `remotion` / `@remotion/*` versions must match (4.0.543 or newer).
Add scripts: `"remotion:studio": "remotion studio"`, `"remotion:render": "remotion render FenlyViralTour out/fenly-viral-tour.mp4"`.
Remotion is free for individuals and companies of up to 3 people; past that,
Fenly needs a company license and its public key in `VITE_REMOTION_PUBLIC_LICENSE_KEY`.

### 2. Type check against the real packages
`npm run lint`. Things most likely to need a small fix: `maxCanvasSinkFrameSize`
on `<Video>`, `premountFor` on `TransitionSeries.Sequence`, the
`TransitionPresentation` type name, `Easing.spring({ damping })`,
`blur({ radius, disabled })`, `lightLeak({ seed, hueShift, progress })`,
`<Solid>` props, the `canRenderMediaOnWeb()` result shape and
`renderMediaOnWeb()` option names (`videoBitrate: 'high'`, `licenseKey`,
`isProduction`). Fix the call, not the design. Don't change `plan.ts` timing
rules without updating its tests.

### 3. Unit tests
`npx tsx --test src/remotion/viral/*.test.ts src/utils/guidedShots.test.ts src/utils/trustSafety.test.ts`.

### 4. Studio + real render with the host's clips
1. Ask the user before copying their clips. With a yes, copy from Downloads into
   `public/samples/` (gitignored): `IMG_3341.mov → shot-1.mov` (bedroom),
   `IMG_3338 → shot-2` (kitchen), `IMG_3342 → shot-3` (bathroom),
   `IMG_3343 → shot-4` (walk-in closet), `IMG_3337 → shot-5` (living room).
   Durations: 9.0, 8.7, 8.47, 6.08, 5.9 s. These are iPhone HEVC `.mov`
   files recorded upright (rotation -90).
2. Temporarily set `USE_LOCAL_SAMPLES = true` and those durations in `sample.ts`.
   Revert before committing.
3. `npm run remotion:studio`: scrub the timeline. `npm run remotion:render`, then
   check with ffprobe: 1080x1920, 30 fps, about 25-30 s (full tour), AAC audio.
4. Pull frames at 0 s, 1 s, 3 s, 4.5 s, 7 s, 8.8 s and the last frame. Compare them
   with the preview and check:
   - Portrait clips are upright, not sideways (rotation metadata).
   - No text sits under the app UI (`theme.ts` `SAFE`).
   - Frame 0 and the last frame match (seamless loop).
   - The grade isn't blown out.
   - The light leak shows at the cut into the last shot.
5. If HEVC won't decode in the render browser, convert the samples to H.264 for
   this test (`ffmpeg -i in.mov -c:v libx264 -crf 18 -c:a aac out.mp4`) and note
   it in the PR text. On phones the export runs in Safari or Chrome, which decode
   the phone's own clips.

### 5. Wire it into Create Listing (`src/components/PostRoomModal.tsx`)
- Lazy-load the editor so Remotion only downloads on this step:
  `const ViralVideoEditor = React.lazy(() => import('./ViralVideoEditor').then((m) => ({ default: m.ViralVideoEditor })))`
  inside `<Suspense>` with a small "Loading editor…" card in the same style.
- Replace the Step 3 `<GuidedViralTourStudio …/>` block with
  `<ViralVideoEditor listing={viralListing} recordedMedia={recordedViralMedia} onRetakeShot={…} onVideoReady={setViralVideo} />`.
  Keep `GuidedViralTourStudio.tsx` in the repo; it just isn't rendered here any more.
- Build `viralListing` with `useMemo` from the existing state: `price → monthlyRent`,
  `beds`, `baths`, `neighborhood`, `city`, `roomType`, `squareFeet`, `selectedAmenities → amenities`.
  Memoize it, or the plan rebuilds every render.
- `onRetakeShot(slot)`: scroll to Step 2 and open that shot's guided camera. Add an
  optional `openCameraForSlot` / `onCameraRequestHandled` pair to `GuidedShotCapture`.
- Publish with an exported video (`viralVideo` state):
  - `videoUrl: viralVideo.url`
  - `tourFormat: 'viral_edit'`
  - `customScenes` built from `viralVideo.plan.shots` (thumbnail from `recordedViralMedia[slot].thumbnailUrl`, so the slideshow fallback still works)
  - keep the host's description
- Publish without an exported video: keep today's path. The Publish button rules
  stay the same (`hasEnoughShots`).
- `src/types.ts`: add `'viral_edit'` to `tourFormat`.
- `src/components/VideoPlayer.tsx`: when `room.tourFormat === 'viral_edit' && room.videoUrl`,
  render `<video src={room.videoUrl} autoPlay loop playsInline muted={isMuted} className="absolute inset-0 w-full h-full object-cover" />`
  in place of the image slideshow. Everything else stays as it is.

### 6. Recommended: Gemini copy pass (no Supabase needed)
`POST /api/viral/copy` in `server/app.ts`:
- Input: listing facts + one 360x640 JPEG per shot, taken in the browser at
  `analysis.best.startSec + 0.5`.
- Model: `gemini-3.8-flash`, `thinkingLevel: LOW`, structured output matching
  `ViralAiHints` in `types.ts`: `hookText`, `hookSlotNumber`, `tags`, `perkLabel`,
  `warnings` for problems only a model can see (a person in the mirror, clutter,
  a countertop close-up, sideways).
- Prompt rules:
  - The hook must contain the exact rent (e.g. "$1,450/mo") and the neighborhood.
  - Tags are 2-3 specific visual words ("Double vanity", "Walk-in closet").
  - No emoji. Never describe who should live there.
- Pass the result as `aiHints`. `plan.ts` already validates it and falls back
  per field.
- When `/api/analyze-clips` (docs/briefs/analyze-clips.md) lands later, map its
  windows / speeds / hook / caption into the same `ViralAiHints`.

### 7. Browser test (desktop Chrome)
`npm run dev` → Home → Landlord → Create Listing → Step 2 "Choose from Camera
Roll" with the 5 samples → Step 3. Check each of these:
- The analysis finishes and the Player loops.
- Switching style and pace updates the Player.
- Editing a callout updates the video.
- "Make my video" produces an MP4 that plays at 1080x1920, about 25-30 s (full tour) or ~13 s (teaser).
- "Use this video on my listing" then Publish plays the MP4 in the feed.
- No console errors.
- No `GEMINI` value anywhere in `dist/` after `npm run build` (the vite plugin enforces this).

### 8. Commit
`git add -A -- . ':!.aistudio'`
`git commit -m "Add Remotion viral room-tour editor: auto-edit, live preview, in-browser MP4 export"`.
Report what you changed, anything you couldn't test (e.g. iPhone Safari export),
and any API fixes from step 2.

## Done when

- [ ] All Remotion packages on one version; `npm run lint` and the tests pass.
- [ ] `remotion render` makes a ~25-30 s 1080x1920 video from the 5 sample clips.
      Upright footage, text inside the safe zone, frame 0 matches the last frame.
- [ ] Create Listing Step 3 shows the editor and the live Player. Style, pace,
      callout and opener changes update the preview.
- [ ] The in-browser export downloads or shares an MP4; the caption copies.
- [ ] Publishing with the exported video plays it in the feed. Publishing without
      one still works the old way.
- [ ] No secrets in the client bundle; nothing from `public/samples/`, `out/` or
      `.env*` committed.
