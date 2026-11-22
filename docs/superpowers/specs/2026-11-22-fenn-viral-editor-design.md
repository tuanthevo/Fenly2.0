# Fenn, the viral editor: design

Approved in conversation by the host on Nov 22, 2026. This file records it.

## Why

Tours should stop the scroll. The host's concept: slow-moving shots of 3 to 5
seconds, room by room, on details, with a different camera move per shot (slide
side to side, push forward, rotate). Quality has to go up without making "Fill my
room" harder: the CEO plan keeps it under 10 minutes with a Quick Tour of 3 shots.

## Goals

- The host films standing still. Every shot is one slow move made with the arms or
  the hips, feet planted.
- Each shot in the video is the slowest, steadiest 3 to 5 seconds of its clip.
- No length target. The video is as long as its good shots.
- Fenn scores every edit out of 20 and re-cuts until it reaches 18, or says
  plainly which clip to retake.
- The share kit's Instagram caption follows the `/ig-caption` rules.

## Not doing (now)

- Carousel and posting plan (`/ig-carousel`, `/ig-plan`): later, they add screens.
- More required shots, or longer ones. Quick Tour stays 3 shots.
- An AI chat agent. Fenn is the editor's name and its self-check, not a chat.

## Would make it a failure

- **Any instruction that tells the host to walk.** Walking shakes the camera (host's
  rule, Nov 22, 2026). Today all five shots and the pre-shot reminder say "walk".
- A slower or longer capture step.
- A score that passes an edit a person would call shaky or dull.
- Playback under 1.0x, or any loosening of the fair-housing or person-in-shot rules.

## Approaches considered

1. **Editing only.** Fenn re-cuts whatever hosts film. Cheapest, but the moves in
   the concept come from the host's hands, so quality stays a matter of luck.
2. **Coach the filming, same effort (picked).** Same shot count, new one-line move
   per shot, Fenn cuts to the steadiest stretch and scores itself. Quality is fixed
   where it starts, and the host does nothing extra.
3. **More shots (wide + detail per room).** Closest to a professional edit, but it
   doubles the filming and breaks the 10-minute target. Kept as optional shots only.

## Design

### 1. Filming (`src/utils/guidedShots.ts`, `GuidedShotCapture.tsx`)

Each guided shot gets a `move`: `slide`, `push` or `turn`. All are done standing.

| Shot | Move | What the host reads |
| --- | --- | --- |
| Bedroom | slide | Stand in the doorway, feet planted. Slide the phone slowly left to right. |
| Kitchen and shared space | turn | Stand in one spot. Turn slowly from the hips, left to right. |
| Bathroom | push | Stand at the door. Reach the phone slowly forward. Stay out of the mirror. |
| Closet and storage (optional) | slide | Doors wide open. Slide the phone slowly right to left. |
| Best feature (optional) | push | Stand close. Reach the phone slowly toward it, then hold. |

- Neighbouring shots use different moves, so the video never repeats one.
- The pre-shot reminder becomes "Lights on. Feet planted. One slow move."
- Recording length does not change.
- After a clip is analysed, if its steadiest 3 seconds are still too shaky or too
  fast, the capture card shows "Try that one slower" with the existing retake
  button. The host can ignore it.

### 2. Editing (`src/remotion/viral/plan.ts`, with its tests)

- A new length preset, `fenn`, is the default for new videos. Full tour and teaser
  stay for listings saved with them.
- Each shot is 3 to 5 seconds: the window of its clip with the lowest, most even
  motion that also passes the existing rules (clear opening, no person, no wall).
  A clip with under 3 clean seconds gives a shorter shot, never slower playback.
- A long clip may give two shots of the same room (the existing split), each 3 to 5 s.
- `MAX_TOUR_TOTAL_SEC` stays as a ceiling only; nothing pads a video to a length.
- The hook, re-hook, best-part reveal, end card and loop keep their reading-time
  rules. The re-hook is skipped when the video is too short to need it.
- Speed stays 1.0 to 1.15x.

### 3. Fenn's score (`src/remotion/viral/fennScore.ts`, new, pure, unit tested)

`scoreEdit(plan, clips)` returns 0 to 20 and the reasons for lost points, using the
ten rows of the audit rubric (`fenly-viral-editor/references/audit.md`), two points
each. It measures what a plan and the clip analysis can show: hook on frame 0,
reading times, change rate, shot lengths in 3 to 5 s, steadiness of each shot, move
variety, clear openings, safe zones, speed, payoff and loop.

- The editor builds the plan, scores it, and tries a small set of re-cuts (other
  windows, dropping the weakest shot) and keeps the best.
- At 18 or more the editor shows "Fenn's score 18/20". Below that it shows the
  score and one fix, for example "Retake the bathroom: hold the phone steadier".
  Export is never blocked.
- The number is Fenn's own check. A real render is still audited by eye before a
  rule changes (as the skill requires), and the audit log records both.

### 4. Caption (`src/fill/sharePosts.ts`)

The Instagram caption: the first 125 characters carry the rent, place and move-in
date; at most 5 specific hashtags; no link in the text (the link goes in the bio or
first comment, which the share kit says); one ask. Tested, fair-housing clean.

## Left to the builder

- The motion numbers that mean "too shaky" (tune on the host's clips in
  `fixtures/guided-shots.json`).
- The exact re-cut candidates Fenn tries.
- Where the score sits on the editor screen (use `impeccable`, existing components).

## Checks

- `npm run lint`, `npm test`.
- A render of the host's clips audited by eye at 18/20 or better, before and after.
