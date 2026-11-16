# Work log, 16 Nov 2026: guided video capture + viral video editor

Branch: `feat/viral-remotion-editor` (built on `feat/guided-5-shot-capture`, from `main`).

| File | What's in it |
| --- | --- |
| [README.md](README.md) | Highlight summary (this page) |
| [improvements.md](improvements.md) | What changed and why it's better, with thoughts on the design choices |
| [todo.md](todo.md) | What still needs doing, in priority order |

## Highlights

Fenly's Create Listing flow went from "upload a video file" to a guided path
that turns a first-time host's phone clips into a finished, share-ready
vertical video.

1. **Guided 5-shot capture** (commit `795375e`)
   - Five shot cards (Bedroom Hook, Kitchen & Shared Space, Bathroom Peek,
     Closet & Storage, Standout Perk), each with exact filming instructions.
   - An in-app rear camera in a 9:16 frame: a "Rotate your phone upright!"
     banner, a "Lights ON • Walk forward • Don't pan side-to-side" reminder,
     a 3-2-1 countdown, 4.5 s of recording with a progress ring, and an
     automatic stop.
   - A Camera Roll fallback that rejects clips under 2 s and warns that
     sideways clips get center-cropped.
   - Preview, retake or replace any card. Publishing needs at least 3 shots.

2. **Remotion viral video editor** (commit `5795e2b`)
   - The shots become a ~10 s 1080x1920 short:
     - a price + neighborhood hook on frame 0
     - fast cuts with whip, zoom and light-leak transitions
     - room callouts
     - a "Wait for the best part" moment midway
     - a price question at the end
     - a seamless loop
   - Each clip is analyzed on the device to find its steadiest, brightest
     second and to brighten dark shots.
   - An optional Gemini pass (`POST /api/viral/copy`, gemini-3.8-flash)
     writes the hook and callouts and flags problems only a model can see,
     such as a reflection in the mirror or a wall edge in frame.
   - A live preview (`@remotion/player`). Style, pace, opener and callout
     edits update it instantly.
   - **Make my video** exports the MP4 in the browser (`@remotion/web-renderer`),
     with no render server, so it works on Vercel. Share or Download copies
     the social caption.
   - **Use this video on my listing**: the feed then plays the exported MP4
     (`tourFormat: 'viral_edit'`).

## By the numbers

- 2 commits, 42 files, about 9,600 lines added.
- 56 unit tests pass (24 before this work); `npm run lint` and `npm run build` are clean.
- Remotion 4.0.544, with every `remotion` / `@remotion/*` package on the same exact version.
- A real export from the host's 5 iPhone clips: 1080x1920, 10.0 s, 8 MB MP4,
  made in the browser in about 42 s. The CLI render is 1080x1920, 30 fps,
  10.0 s, with AAC audio.
- The Gemini copy pass took about 5.5 s for 5 shots.
- No secrets in the client bundle: the Gemini key is not in `dist/`; only
  the public Maps key is.

## How it was verified

- **Browser pane at phone size, with no real camera:**
  - Recording was tested with a fake canvas camera stream.
  - Camera Roll was tested with clips generated in the browser and with the
    host's 5 real `.mov` clips.
  - Run all the way through: analyze, edit, export, attach, publish, and the
    video plays in the feed.
- **CLI render** (`npm run remotion:render`) with the host's clips; frames
  checked at 0, 1, 3, 4.5, 7 and 8.8 s and the last frame.
- **Not verified:** a real phone camera, and export in iPhone Safari. See [todo.md](todo.md).
