# Auditing a Fenly room-tour render

Use this before and after every editing change. It turns "it looks off" into a
score you can fix.

## 1. Get a real render

- **App path (preferred; it runs the clip analysis and the Gemini pass):** in the
  app, Create Listing → Step 2 Camera Roll with the 5 samples → Step 3 → wait until
  the status reads Ready and the callouts have filled in → Make my video. Read the
  blob in the page and inspect frames with a `<video>` and a canvas. Wait about
  200 ms after each seek before drawing; drawing right after `seeked` can return
  the previous frame.
- **CLI path (quick, no analysis):** copy the host's clips into `public/samples/`
  (gitignored, and only with the user's permission), set `USE_LOCAL_SAMPLES = true`
  and the real durations in `sample.ts`, run `npm run remotion:render`, then
  revert `sample.ts` before committing.

```bash
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate:format=duration -of compact out/fenly-viral-tour.mp4
```

## 2. Pull frames

Pull frames at these points (get the cut frames from the plan's `cuts[].atFrame` and
`shots[].startFrame`):

| Frame | What it checks |
| --- | --- |
| 0 | Hook: the cover, the best room, the headline fully readable |
| hook end − 5 | Headline still fully on screen, not leaving yet |
| each cut + 3 | Transition energy, no wall or floor at a room's start |
| each cut + 15 | Callout entered, readable, not covering its subject |
| re-hook | "Wait for the best part" readable, not stacked on a callout |
| perk midpoint | The payoff is big, slow and clearly the best moment |
| end card + 30 | Price question readable, nothing else animating |
| last frame | Matches frame 0 (seamless loop) |

```bash
# one frame at a time
ffmpeg -v error -y -i out/fenly-viral-tour.mp4 -vf "select=eq(n\,FRAME),scale=360:-1" -frames:v 1 out/f_FRAME.png
# a strip to compare side by side
ffmpeg -v error -y -i out/a.png -i out/b.png -i out/c.png -filter_complex hstack=inputs=3 out/strip.png
```

Delete the PNGs afterwards. `out/` is gitignored, but keep it tidy.

## 3. Score it (0-2 each, 20 max)

| # | Check | 0 | 1 | 2 |
| --- | --- | --- | --- | --- |
| 1 | Frame 0 | Dark, wall, or a fade | OK room, weak framing | Best room, wide, bright, headline fully visible |
| 2 | Hook copy | No price or place | One of them | Exact rent and neighborhood, ≤ 64 chars |
| 3 | Readability | Text hard to read on some frames | Readable but small or thin | Bold, outlined or on a pill, readable in every frame |
| 4 | Placement | Text under the platform UI or over the subject | Inside `SAFE` but crowded | Inside `SAFE`, clear of the subject, one element at a time |
| 5 | Reading time | Text leaves before it can be read | Tight | Passes the rule: max(0.8 s, 1.2 s + 0.22 s × words) + 0.3 s per number |
| 6 | Change rate | Gaps over 4 s with nothing new | 3-4 s | Something new every 2-3 s, uneven |
| 7 | Speed | Fast-forward look, a crawl, or any shot under 1.0x (stutter) | Uneven between rooms | Natural walk at 1.0-1.15x everywhere, no ramps, no slow motion (Fenly, Nov 2026) |
| 8 | Room openings | A wall, door edge or freeze | One weak opening | Every room opens on a clear, wide view |
| 9 | Look | Rooms look like different homes | Mostly consistent | Bright, true, consistent; windows not blown out |
| 10 | Ending | No question, or no loop | One of them | Real price question, last frame matches frame 0 |

**16+** is ready to post. **12-15**: fix the lowest rows first. **Under 12**: start
with rows 1-2 (the hook), because nothing after a weak hook gets watched.

## 4. Report back

Tell the user, in plain words:
- the score and the two or three biggest problems, with the frame where each shows
  (attach the strip);
- what you'll change, and what it costs (for example "+1.5 s total");
- after the change, the new score and the same frames, side by side.
