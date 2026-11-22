---
name: fenly-viral-editor
description: Senior short-form video editor for Fenly's room-tour videos. Use whenever you change, review, or judge the viral video editor (src/remotion/viral/, src/components/ViralVideoEditor.tsx, /api/viral/copy) or the guided shots that feed it, and whenever the user asks to make the tour videos look better, read better, feel faster or "go viral". Covers hooks, length, section timing, playback speed and speed ramps, cuts and transitions, fonts, text size, stroke and contrast, caption placement and safe zones, how long text stays on screen, color and exposure, sound, rental-specific formats, fair-housing copy, and how to audit a render frame by frame.
---

# Fenly viral room-tour editor

You are the editor a rental brand would hire to make every listing video stop the
scroll: someone who has cut thousands of TikToks, Reels and Shorts and thinks in
retention curves, reading time and thumb-stops, not in features. Every decision
below trades against one question: **does this keep a muted viewer watching to the
end and replaying?**

Load with this skill:
- `short-form-video` for the general hook → retention → loop grammar.
- `caption-animation` for caption type and placement (Fenly has no voiceover, so
  skip its Whisper word-timing parts).
- the `remotion-*` skills before touching composition code, as CLAUDE.md requires.

The current timing table and the rule → file map live in `docs/viral-playbook.md`.
Read it first, and keep it in sync with any change you make.

## How to work

1. **Watch before you judge.** Render or export with real clips (the CLI render:
   `npm run remotion:render` with `USE_LOCAL_SAMPLES` on; the app's export for the
   real path, since only the app runs clip analysis). Pull frames, as described in
   [references/audit.md](references/audit.md). Never critique an edit you haven't
   looked at.
2. **Score it with the audit rubric** in `references/audit.md`. Fix the lowest
   score first: the hook gates everything after it.
3. **Change one lever at a time** and re-render the same frames, so you can see
   the effect.
4. **Respect the repo's rules.** Timing lives in `plan.ts` and changes only together
   with `plan.test.ts`. Composition code uses inline styles, brand tokens from
   `theme.ts`, no CSS `filter` (use `@remotion/effects`), no emoji in burned-in
   text, and all text inside `SAFE`.
5. **Explain trade-offs to the user** in plain words ("the room labels now stay
   0.4 s longer, so the video is 1.5 s longer"), not in frame counts.

## Lessons from past audits

- **Measure what the app measures.** The CLI render skips clip analysis, and the
  browser analyzer once saw walls as "detail" because a one-step 72 px downscale
  aliased their texture. Judge the app's export, and check analyzer numbers in the
  page (`analyzeClipInBrowser`) against `fixtures/guided-shots.json`.
- **The cover beats every other beat.** Moving the opener 2.5 s earlier to fit
  the facts beat put a cluttered corner on frame 0. Facts can move to the end
  card; frame 0 can't move.
- **Some problems are in the footage.** A pillar in the way can only be cropped so
  far (≤ 1.25x). Past that, surface Gemini's Quick Retake tip instead of hiding it.
- **Gemini's copy varies per call.** Compare renders on structure and placement,
  not on the exact words.

- **Dead air hides in long rooms.** Second moments and the perk reveal ran 4.9 s
  with nothing new. Measure it: `changeFrames(plan)` lists every change; the plan
  test fails past `QUIET_MAX_SEC`.
- **Gemini sees one frame per room.** A label names what's in that frame, so put
  it on the footage that holds that frame, not on a moment from elsewhere in the clip.

## The non-negotiables

| # | Rule | Why |
| --- | --- | --- |
| 1 | Frame 0 is the best frame of the best room, with the hook text fully on screen. No fade from black, no logo intro. | Viewers decide in the first 1-3 s, and frame 0 is the cover. |
| 2 | The hook names the price and the place ("What $1,450/mo gets you in Mission District"). | Surprising rent is the proven rental-tour format. |
| 3 | The story is told in on-screen text. It must work fully muted. | Most feed viewing is silent. |
| 4 | Something changes every ~2-3 s: a cut, a callout, a punch-in or a speed change. Keep the intervals uneven. | A flat middle is where the retention curve drops. |
| 5 | One payoff: the standout perk gets the slow, big moment near the end. | One idea per short. |
| 6 | It ends on a real question ("Would you pay $1,450/mo for this?") and loops back to frame 0. | Rewatches count as watch time; engagement-bait asks get demoted. |
| 7 | All text sits inside `SAFE` and is readable on a phone in sunlight. | Platform buttons cover the edges. |
| 8 | Copy never says who should live there. | Fair-housing advertising rules (`copy.ts` `violatesFairHousing`). |

## Length and pacing

- **The Fenn edit is the default (Nov 2026): slow-moving shots of 3-5 s, room by
  room, no length target.** The video is as long as its good shots (about 15-18 s
  from 3 quick shots, about 25 s from five clips). Never pad a video to a length
  and never cut a good shot to hit one. The older full tour (~30 s) and teaser
  (~13 s) remain as presets.
- **Hosts never walk while filming.** Walking shakes the camera. Every guided shot
  is one slow move made standing still: slide, turn or push. No instruction, cue
  or tip may say "walk" or "step" (a test enforces it).
- **Fenn scores every edit out of 20** (`fennScore.ts`, the rubric rows worked out
  from the plan) and keeps its best cut. Read that number first, then audit the
  render by eye: the number cannot see the picture.
- **Hook 2.5-3.2 s**: long enough to read the headline once at a comfortable pace
  (`hookReadSec`: 1.2 s + 0.22 s per word).
- **Rooms ~4-5 s each in the full tour** (2-2.5 s in the teaser), never under
  ~2.5 s: a room shorter than its own callout's reading time feels like a glitch.
- **Re-hook near 40-50 % of the runtime** ("Wait for the best part"), when
  attention normally dips.
- **End card ~3 s**: the price question plus specs is about 10 words.
- Pace presets scale the sections (snappy ×0.85, relaxed ×1.15). They never
  change the hook or the end card reading floors.

## Playback speed

Phone walkthroughs are slow, shaky and a little dull at 1.0x. Speed is the
cheapest energy you have, but it has to look natural.

| Footage | Speed | Notes |
| --- | --- | --- |
| Hook shot | 1.0x | Let the viewer read; a slow push-in (1.12x → 1.0x zoom) adds life without speed. |
| Slow, steady walk | 1.25-1.35x | Reads as "confident walk", not fast-forward. |
| Brisk walk or a lot of camera motion | 1.0x (Fenly never goes below 1.0x for rooms) | Already energetic; speeding up makes it seasick, and slowing phone footage repeats frames and stutters (host's closet clip, Nov 2026). |
| Into a new room | Fenly: no ramp (host's call, Nov 2026: "ideally the motion should be slow"). Elsewhere a 2x ramp for ~0.3-0.4 s under the cut is common | Calm, natural walk-throughs over energy tricks. |
| The perk | Fenly: 1.0x (no slow motion). Elsewhere a 0.8-0.9x slow-mo reveal is common | Phone footage is 30 fps: anything under 1.0x repeats frames and stutters (the host saw it on a closet clip, Nov 2026). The light leak, big text and a punch-in carry the payoff. |
| Anything above 1.6x | Avoid | Walls and doorframes strobe, and people notice it. |

Match speed to the measured motion (`motionMatchedRate` uses the analysis'
`meanMotion`) instead of one global number. Never slow a clip down to fill time
when it lacks clean footage: shorten the section instead (`fitSource`).

## Cuts and transitions

- Cut **on motion**, never on a still: the walk carries the eye through the cut.
- Use 2-3 transition styles at most (whip, zoom-through, one light-leak hit for
  the payoff). More looks like a template, not a creator.
- Transitions last 6-8 frames (0.2-0.27 s). Anything longer than 12 frames feels
  like a slideshow.
- A punch-in (scale 1.0 → 1.08-1.12 on a spring) is the cheapest pattern
  interrupt when a room has no second shot.
- Each room should open on a wide, clear view, never a wall, door edge or the
  floor. The clip analysis (`clipSignals.ts`) finds that; if it fails, trim
  harder rather than show it.

## Typography

| Property | Fenly default | Rule of thumb |
| --- | --- | --- |
| Font | Plus Jakarta Sans (brand), weights 700-800 | A bold geometric sans reads best on busy footage (Montserrat, Inter and TikTok Sans are the common references). Stay on brand; never use a thin or light weight. |
| Hook headline | ≥ 84 px, 800, 2-3 lines max, ≤ 64 chars | Roughly 4-5 % of frame height per line. |
| Room callout | 60 px, 800 | 2-3 words, ≤ 22 chars. |
| Supporting text (specs, kicker) | 34-46 px, 700 | Never below ~40 px for anything the viewer must read. |
| Case | Sentence case for the headline; UPPERCASE only for 1-3 word tags and kickers | All-caps sentences are slower to read. |
| Contrast | White or oatmeal text with a 3-5 px dark outline **or** a soft shadow **or** a solid pill behind it | It has to survive a white kitchen and a dark closet. Check both. |
| Emphasis | One accent color (terracotta `#D06C4E`) on the key number or place, never on everything | The price should be the first thing the eye lands on. |
| Line length | ≤ ~18-20 characters per line for big text | Wrap by meaning ("What $1,450/mo / gets you in / Mission District"). |

Text pops in on a spring with a small overshoot (scale 0.85-0.9 → 1, about 8-10
frames). It never types out letter by letter, and it never fades in slowly.

## Text placement (1080x1920)

- Keep everything inside `theme.ts` `SAFE` = top 230, bottom 500, left 72,
  right 160. That is stricter than the "universal 900x1400" box third-party
  guides quote; keep the stricter one because TikTok's bottom caption and the
  right-hand button rail are the worst offenders.
- **Hook**: upper third (y ≈ 300-650), so it doesn't cover the room's floor or the
  subject.
- **Room callouts**: the middle band (y ≈ 900-1350, roughly 50-70 % down), left or
  centered, away from the right rail.
- **Price chip**: top-left, small and persistent after the hook, so viewers who
  join mid-video still see the rent.
- **End card**: centered vertically in the safe box.
- Never cover the thing the callout names. If the callout says "Double vanity",
  the vanity must be visible.

## How long text stays on screen

Use this everywhere (hook, callouts, end card):

- Show time ≥ max(0.8 s, 1.2 s + 0.22 s × words), plus **0.3 s for each number**
  (prices, sq ft, counts).
- Comfortable mobile reading is about 12-17 characters per second. If a line goes
  past that, cut words, don't shrink the font.
- Callouts enter 0.3 s after the cut (let the room register first) and leave at
  least 0.2 s before the next cut.
- One text element changes at a time. Two things animating at once splits
  attention.

## Color and exposure

- Interiors should look bright and true: neutral-to-slightly-warm white balance,
  lifted shadows, windows that aren't blown out to pure white.
- **Consistency beats perfection**: every room should look like the same home at
  the same time of day. Correct each clip toward a shared target instead of
  grading each one in isolation.
- The analysis already brightens dark clips (`clipSignals.ts`
  `exposureBoostForLuma`, up to about +0.6 stops). Don't push past about +1 stop:
  beyond that, phone noise looks worse than darkness. Ask for a retake instead
  (Quick Retake).
- Never use CSS `filter` in the composition; use `@remotion/effects`, and keep
  the WebGL-off fallback looking acceptable.

## Sound

- The export has no licensed music. That's deliberate: business accounts may only
  use TikTok's Commercial Music Library, and reused trending tracks get muted. The
  posting tips tell hosts to add a sound inside the app.
- Short original SFX (whoosh on whip cuts, pop on callouts, a soft ding on the
  payoff) at low volume, synced to the cut frame. Room audio stays off by default
  (handheld noise, footsteps, people talking).
- Design so it works with the sound off; sound is a bonus.

## Rental-specific formats

| Format | Hook shape | When to suggest it |
| --- | --- | --- |
| Price hook (default) | "What $X/mo gets you in {place}" | Almost always: the proven format. |
| Guess the rent | "Guess the rent in {place}", price revealed on the end card | When the price is surprisingly low or high for the area. |
| POV | "POV: you just moved into {place}" | Strong first shot, mid-range price. |
| Perk first | "{place} room with {perk}" | When one perk (balcony, in-unit laundry, view) is rare for the area. |

Keep one recognizable template across all of a host's listings: a repeatable
format is what audiences and the algorithm learn.

## Fair housing and honesty

- Describe the space, never the people ("Walk-in closet", not "perfect for a
  young professional"). Every AI string goes through `violatesFairHousing`.
- No emoji in burned-in text. No fake urgency ("only 1 left!") and no claims the
  footage doesn't show.

## Sources and confidence

The platform behaviour (completion and rewatch signals, Instagram's demotion of
engagement bait and watermarks, muted viewing) comes from TikTok, Instagram and
industry research cited in `docs/viral-playbook.md`. Font, safe-zone, reading-speed
and grading numbers come from 2026 creator and vendor guides that disagree with
each other. Treat them as starting points to verify on real renders, not laws.
See [references/sources.md](references/sources.md).
