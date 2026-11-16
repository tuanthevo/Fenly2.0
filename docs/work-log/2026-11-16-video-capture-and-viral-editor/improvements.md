# What was improved, and thoughts on it

## Before → after

| Area | Before | After |
| --- | --- | --- |
| Filming | One generic video file input; hosts had to guess what to film | 5 guided shot cards with exact, beginner-proof instructions |
| Camera | Fish-eye studio camera with a 7.5 s slow pacer | Rear camera in a 9:16 frame: rotate warning, reminder pill, 3-2-1 countdown, exactly 4.5 s, auto-stop |
| Bad clips | Anything accepted | Clips under 2 s rejected with a friendly message; sideways clips accepted with a center-crop note |
| Missing shots | Empty slots were filled with stock clips of *other* apartments | Only the host's own shots are published; at least 3 are needed |
| Editing | One `<video>` swapping clips at 0.75x with small text | A real edit: hook on frame 0, cuts every ~1.35 s, transitions, callouts, a mid-video hook, a price question, and a seamless loop |
| Picking the footage | Fixed trims (0.5 to 3.5 s) | On-device analysis picks the steadiest, brightest window and fixes exposure |
| Words on screen | Templates | Gemini reads a frame of each shot, writes the hook and callouts, and flags problems it can see; a fair-housing filter covers every string |
| Output | Nothing to share | An MP4 export in the browser, Share / Download, a copy-ready caption and posting tips |
| Feed | Image slideshow | Plays the exported MP4 (`viral_edit`); the slideshow is still the fallback |

## Design choices and why

- **Guardrails live in pure, tested modules.** `src/utils/guidedShots.ts` and
  `src/remotion/viral/plan.ts` hold every rule (the 2 s minimum, the 3-shot
  gate, timing, the order of shots), so the UI can change without silently
  breaking them. Timing rules change only together with their tests.
- **The edit is plain JSON.** `plan.ts` builds the edit, and
  `FenlyViralTour.tsx` only draws it. The same plan drives the live preview,
  the browser export and the CLI render, and Gemini hints are just optional
  inputs, so each AI field can fall back to the local rules on its own.
- **No render server.** `@remotion/web-renderer` exports on the host's own
  device. That avoids Vercel's 4.5 MB body limit and its function timeouts,
  costs nothing per render, and the clips never leave the phone. Only small
  360x640 stills go to Gemini.
- **Remotion loads only when needed.** The editor is lazy-loaded once the
  first shot exists, so the main bundle doesn't grow (it was checked: there
  is no Remotion code in `index-*.js`).
- **An attached video is cleared when anything changes.** Retaking a shot or
  editing the price clears the attached MP4, so an old price can't be
  published by mistake.
- **The old code is kept, not deleted.** `GuidedViralTourStudio.tsx` is no
  longer rendered in Create Listing but stays in the repo, so nothing else
  that uses it breaks.
- **The Gemini call matches the repo.** The `gemini-api-dev` docs now show
  the newer Interactions API, but every Fenly route uses `generateContent`
  with `responseSchema` and `ThinkingLevel`. Moving to the new API needs your
  sign-off, so the new route follows the existing routes (see todo.md).

## Bugs found and fixed along the way

- **Sideways camera roll clips weren't flagged.** The clip metadata reader
  read the width and height *after* unloading the video, when both are 0.
  It now captures them first.
- **Type error against the real Remotion packages.** `renderMediaOnWeb`'s
  composition needed `defaultProps`, because the component's props are
  required. It was the only fix needed against the real typings.
- **Off-screen feed videos.** An exported video in the feed would have kept
  playing when it scrolled off screen. Only the card on screen plays now.

## Lessons

- Testing with the host's real clips mattered. Gemini's warnings (a
  reflection in the mirror, a wall edge in the living-room shot) were
  specific and correct, and the in-app analysis chose much better moments
  than the CLI sample, which skips analysis and opened two shots on a bare
  wall.
- iPhone HEVC `.mov` clips decoded fine both in headless Chrome (CLI render)
  and in the desktop app's browser pane, so the H.264 conversion step in the
  brief wasn't needed.
