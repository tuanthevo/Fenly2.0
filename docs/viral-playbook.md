# Fenly viral room-tour playbook

What makes a rental / real-estate short travel, and where each rule lives in
the code. Researched November 2026. Nobody can promise a million views (the
listing itself, the price, timing and luck matter most); the editor removes
the usual reasons a video dies early and packages every listing in a format
that already works.

## How the platforms decide

| Signal | What it means for us | Source |
| --- | --- | --- |
| Finishing a video is one of TikTok's strongest interest signals | Every section earns its seconds, and the end loops back to frame 0 so finishing and rewatching are easy | [TikTok Newsroom: How TikTok recommends videos](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/) |
| Length: 2026 data favors ~20-35 s for a tour. TikTok videos around 30 s get the highest engagement rate; Reels of 30-60 s get the highest reach; real-estate guides land on 20-30 s for listing Reels. 7-10 s clips finish more often but give the algorithm far less watch time per view | Default to a ~25-30 s **full tour**; keep a ~13 s **teaser** for a second post or Stories | [Socialinsider: TikTok length](https://www.socialinsider.io/blog/how-long-are-tiktok-videos/), [Socialinsider: Reels statistics 2026](https://socialinsider.io/blog/instagram-reels-statistics/), [Typito: listing Reels](https://dunphy.typito.com/blog/how-to-create-instagram-reels-for-property-listings), [OpusClip: TikTok retention](https://www.opus.pro/blog/tiktok-length-format-retention-data), [ttcalculator: completion vs. watch time](https://ttcalculator.net/data/engagement/completion-rate-by-video-length/) |
| Instagram ranks Reels by how likely people are to reshare and to watch to the end | Same: short, loopable, worth sending to a friend | [Open Influence summary of Mosseri's ranking post](https://openinfluence.com/?p=27806) |
| Instagram won't recommend posts that explicitly ask for shares, comments or tags | End on a genuine question ("Would you pay $1,450/mo for this?"), never "comment YES" | [Social Media Today](https://www.socialmediatoday.com/news/instagram-says-using-certain-ctas-can-impact-post-reach/717732/), [clarification](https://www.socialmediatoday.com/news/instagram-clarifies-advice-on-single-word-ctas-and-longer-reels/718151/) |
| Eligible Reels are original and have no visible watermarks (your own logo is fine) | Export a clean MP4 and upload it to each app; never repost a TikTok download | [Instagram: Recommendations and originality](https://creators.instagram.com/recommendations-and-originality), [Mosseri on own logos](https://www.socialmediatoday.com/news/instagram-clarifies-that-including-your-own-logo-on-a-reel-is-ok/730852/) |
| 69% of people watch video with the sound off in public; 80% are more likely to finish with captions | The story is told in on-screen text; sound is a bonus | [Verizon Media / Publicis via Streaming Media](https://www.streamingmedia.com/Articles/News/Online-Video-News/80-of-Video-Caption-Users-Arent-Hearing-Impaired-Finds-Verizon-131860.aspx) |

## What works for rentals specifically

- **Open on the best-looking shot, in the first 3 seconds.** TikTok's own
  real-estate guide says the 0-3 s hook should be the most striking feature,
  with a quick text overlay naming the location.
  ([TikTok for Business real-estate guide](https://ads.tiktok.com/business/en/guides/real-estate-advertising-guide))
- **Lead with the price and the place.** "This is what $1,600 gets you in…"
  and "how much do you pay in rent?" tours are the formats that keep going
  viral; people react to surprising prices.
  ([Fox News on @newyorkcityrealtor](https://www.foxnews.com/real-estate/nyc-realtor-shocks-tiktok-worst-apartment-ever.print),
  [Business Insider on a $12,000 tour](https://businessinsider.in/thelife/news/a-tour-of-a-2-bedroom-new-york-apartment-priced-at-12000-a-month-according-to-the-tiktoker-who-filmed-it-has-left-viewers-shocked/amp_articleshow/92184042.cms))
- **Be consistent.** Caleb Simpson's view: audiences (and the algorithm)
  recognise and reward a repeatable format. Every Fenly listing gets the same
  recognisable template.
  ([The Guardian via inkl](https://www.inkl.com/news/what-does-5-000-a-month-get-you-the-viral-star-barging-into-new-york-apartments))
- **Keep text out from under the app's buttons.** On 1080x1920, TikTok covers
  about 220 px at the top, 480 px at the bottom and 140 px on the right.
  ([revid TikTok safe-zone checker](https://www.revid.ai/tiktok-safe-zone),
  [cross-platform guide](https://wildandfreetools.com/blog/vertical-video-safe-zones-guide-2026/))

## Section timing (full tour, balanced pace, 5 guided 7 s shots ≈ 35 s when every shot is clean)

Targets after the November 2026 updates: 30-45 s (rooms aim for 7 s, the perk for 5 s, the end card 3.5 s). Rooms still shrink to their clean footage, so real clips with doorways or edges give shorter tours. Long clips are no longer thrown away: a room with 10 s+ of clean footage plays as **two moments** of ~5.5 s from different parts of the clip, joined by a zoom cut (whips stay for room changes); the opener's room gets a tour moment after the headline when there's 4 s+ footage left; a closer that isn't the perk gets a moment before its reveal. Tours are capped at 50 s: past it, rooms and the closer first play faster (same footage, up to 1.35x, the opener stays real time), and only then are extra moments dropped, last first (host's call, Nov 2026). Rooms split into two moments from 8 s of clean footage, which 10 s recordings give. Host test (5 phone clips, 7-20 s): 35.4 s → 43.5 s; Quick Tour with 3 of them: 21.5 s → 31.0 s. The table below describes the beats; the exact targets live in `plan.ts` `LENGTH_PRESETS`.

| Section | Length | Speed | What's on screen | Why |
| --- | --- | --- | --- | --- |
| Hook | headline reading time: 1.2 s + 0.22 s/word + 0.3 s per number, 2.5-3.2 s (≈3.0 s for "What $1,450/mo gets you in Mission District") | 1.0x, no ramp | best frame of the best shot, price + place headline, slow settle from 1.12x zoom | viewers decide in 0-3 s; frame 0 is also the cover |
| Answer | ≈3 s, same shot keeps rolling | 1.0x, never slower (short footage gives a shorter opener; the facts then move to the end card) | "1 bed · 1 bath", "220 sq ft", best amenity, popping in 0.2 s apart; price chip appears | pays off the hook's question right away |
| Each room | ≈7 s, or two ≈5.5 s moments for long clips (shorter when the clip has less clean footage, never under 2.6 s) | matched to camera movement, 1.0-1.15x (target motion 0.05), no ramp. Never below 1.0x: the host's closet clip slowed to 0.85x looked slow and choppy, because phone footage played under real time repeats frames. A short clip gets a shorter room instead | room tag at 0.3 s and a second callout at ~2.3 s; a second moment shows the room's detail right after the zoom cut | the host wants slow, natural motion; the cut and callouts carry the change rate |
| Re-hook | 1.2 s, on the room nearest 45% of the runtime | | "Wait for the best part" | carries viewers through the mid-video dip |
| Perk | ≈3.4 s | 1.0x, no ramp (no slow motion: 30 fps phone footage under 1.0x repeats frames and stutters, host, Nov 2026) | "THE BEST PART" + the perk, big, light leak + punch-in | the payoff gets the big text, the light leak and a gentle punch-in instead of slow motion |
| End card | ≈3.2 s | footage keeps rolling (may hold its last frame here only) | price question, place, specs, "Tour it on Fenly" | ~10 words need ~3 s to read |
| Loop | last ~0.3 s | | the opening shot fades back in | the replay starts seamlessly |

Pace scales the sections: snappy ×0.85, relaxed ×1.15. The teaser keeps the
hook (≈2.3 s) and runs ~2.2 s rooms at 1.0-1.25x with no ramps (≈13 s); it
never splits rooms.
Host's length rule (Nov 2026): with 3+ clips a tour runs **30-50 s**
(`plan.ts` `MIN_TOUR_TOTAL_SEC`, `MAX_TOUR_TOTAL_SEC`; `grade.ts` blocks export
outside it). The plan never stretches footage (no slow motion, no walls or
people), so the floor comes from filming: guided and Quick Tour shots record
**15 s** (was 7 s and 5 s). Real clips keep ~55-70% clean footage after the
tap-to-record shake and doorways; 3 × 10 s gave ~24 s. Test clips: 3 × 15 s ≈ 36 s,
4 × 15 s ≈ 47 s, 5 × 15 s ≈ 50 s at 1.05x, 5 × 20 s ≈ 49 s at 1.15x (sped up to
fit 50 s, every moment kept). A tour under 30 s asks the host to film the rooms
with the least usable footage again.

### Fenly 2.0 Quick Tour (Fill tab)

The Fill flow films 3 shots of 15 s (room, shared space, bathroom; `guidedShots.ts`
`shotsForMode('quick')`; 5 s until Nov 2026), with 2 optional extras (closet,
perk) for a fuller tour. With 15 s shots each room gets two moments, so 3 shots
give a ~36 s tour; the extras take it to ~47-50 s. Fill exports only the full tour
(the ~13 s teaser code stays behind `exportTeaserToo`; nothing played it). The
editor grades every edit on `references/audit.md` (`grade.ts`) and exports only
at 18/20 or more. Audit (Nov 2026, 3 sample shots via the app export):
17.3 s, 14 MB at 1080x1920, about 16/20 on `references/audit.md`; the softest
rows were the hook leaving at ~2.7 s (reading floor ~3.0 s for 7 words + a
price) and one 4.5 s stretch with a single callout in the last room.

## Rules → code

| Rule | Implementation |
| --- | --- |
| Best shot first; price + neighborhood headline fully visible on frame 0 (also the cover) | `plan.ts` `pickHookSlot`, `overlays.tsx` `HookTitle` |
| Hook styles: price hook, guess the rent (price hidden until the end card), POV | `copy.ts` `defaultHook`, `STYLE_INFO` |
| Section lengths and speeds above; full tour (default) or teaser | `plan.ts` `LENGTH_PRESETS`, `PACE_PRESETS`, `hookReadSec` |
| Sections shrink to the clean footage a clip has instead of slowing to a crawl or showing a wall | `plan.ts` `fitSource`, `clipSignals.ts` `findCleanRange` |
| Room speed matched to camera movement | `plan.ts` `motionMatchedRate` (uses the analysis' `meanMotion`) |
| Speed ramps (off since Nov 2026; `LengthPreset.ramp` is null, the renderer still supports them) | `FenlyViralTour.tsx` `ShotFootage` (two back-to-back segments of the same clip) |
| Long clips play as two moments of one room, zoom cut between them, 50 s cap reached by speeding rooms up to 1.35x before dropping moments | `plan.ts` `planSegments`, `MOMENT_SEC`, `SPLIT_MIN_CLEAN_SEC`, `MAX_TOUR_TOTAL_SEC`, `MAX_FIT_RATE`; the editor lists one row per room (`editableShots`, `roomDetail`) |
| Video text at 80% (photo tours 64%); story bar at 52 px (the top edge; the Find feed shows no other progress bar on a tour video) | `plan.ts` `VIDEO_TEXT_SCALE`, `overlays.tsx` `STORY_BAR_TOP` |
| Something new at least every 3.2 s: a quiet stretch gets a gentle punch-in (1.06x over 10 frames) at its middle, never on the opener, a photo shot or a shot already zoomed past 1.15x to crop a wall. Host test (5 clips, with AI copy): longest quiet stretch 4.9 s → 3.0 s | `plan.ts` `QUIET_MAX_SEC`, `changeFrames`, `addPunchIns`; `FenlyViralTour.tsx` `ShotLayer` |
| Gemini scans a small frame about every 1.2 s of each clip (up to 14 per clip; the browser analysis covers the first 20 s of a clip, so long camera-roll clips keep their later footage): what's in view and whether a person is in shot. Room tags and details go only on footage that shows the thing, within ~1.3 s of when they're read; a moment with nothing nameable gets a listing fact. Real clips: "Modern kitchen" over the living room became "Sectional sofa" | `aiCopy.ts` `scanTimes`, `server/frameNotes.ts`, `plan.ts` `labelInView`, `LABEL_MAX_GAP_SEC` |
| Footage with a person (or a reflection of one) never plays: each clip keeps its longest person-free stretch as hard limits, 0.7 s clear of any flagged frame, end card included; a clip with under 2 s left is dropped. Real clips: 36.8 s → 24.8 s with nobody in shot | `plan.ts` `withoutPeople`, `PERSON_PAD_SEC`, `MIN_PERSON_FREE_SEC` |
| Rooms and the opener open on a clear view: scan frames flag a door frame, wall edge or something close to the camera (a chair, a bag) or a camera still in the doorway. A clip's usable footage starts past the blocked frames it opens on, and every shot slides its first second off a blocked frame when its footage allows. Real clips: the bedroom no longer opens in the doorway, the kitchen no longer opens behind a chair | `plan.ts` `withClearOpening`, `clearStartSec`, `BLOCKED_BEFORE_SEC`, `BLOCKED_AFTER_SEC` |
| The re-hook lands on a room on screen at least 3 s, so the room's label and the re-hook never crowd a short room | `plan.ts` `REHOOK_MIN_ROOM_SEC` |
| The best-part reveal waits until the light leak has passed (0.3 s after the cut), so the flash never washes out the payoff | `plan.ts` `tagInFrameOf` |
| The price hook keeps one shape: an AI headline is used only if it reads "What $X/mo gets you in {place}" | `plan.ts` `PRICE_HOOK_SHAPE` |
| A split room's AI detail goes on the moment that holds the frame Gemini saw (Gemini sees one frame per room); the other moment gets a listing fact | `plan.ts` `detailMomentOf` |
| Without clip analysis the opener starts 25% into the clip (0.6-2 s), past the record tap | `plan.ts` `sourceInfo` `NO_ANALYSIS_START_SHARE` |
| The best-part reveal names only what Gemini saw or the host typed; otherwise it says "Worth the wait" and the perk amenity shows as a listing fact instead | `copy.ts` `PERK_FALLBACK_LABEL`, `defaultTags` |
| Bright windows keep their detail: the grade rolls off highlights (-0.35) and whites (-0.2), more when a shot is brightened. Phone clips aren't clipped at the source; the lift was clipping them. Real clips: kitchen window pixels at pure white 5.5% → 0.1% | `look.ts` `gradeFor`, `HIGHLIGHT_ROLLOFF`, `WHITES_ROLLOFF` |
| Cleanest stretch of each clip (no wall, no door edge, no whip pan), auto-brightened | `clipSignals.ts` (tuned on real phone clips, see the fixture test) |
| A room opens only where at least 90% of the frame shows the room (column coverage), never in the hallway or behind a door edge | `clipSignals.ts` `columnCoverage`, `OPENING_COVERAGE_MIN`, `findCleanRange` (tested on the host's 5 guided shots, `fixtures/guided-shots.json`) |
| A pillar, wall or door edge that stays along one side is cropped with a small zoom (≤ 1.25x) anchored on the other side | `clipSignals.ts` `sideBand`, `plan.ts` `reframeFor`, `FenlyViralTour.tsx` `reframeStyle` |
| Browser sampling downscales in two smoothed steps, so wall texture doesn't alias into fake detail | `analyzeClipInBrowser.ts` |
| Gemini hooks over 8 words are dropped for the editor's own 7-word headline (the hook is on screen ≤ 3.2 s) | `server/app.ts` `MAX_AI_HOOK_WORDS` |
| Listing facts answer the hook; a second callout per room (Gemini sees the frame, else listing facts and the lease) | `copy.ts` `heroFacts`, `listingFacts`; `overlays.tsx` `Callout`; `/api/viral/copy` `details` |
| Whip / zoom transitions with motion blur, a light-leak hit on the payoff | `transitions.tsx`, `FenlyViralTour.tsx` `ShotLayer` |
| 2-3 word room callouts, readable in a second with the sound off | `copy.ts` `cleanTag`, `overlays.tsx` `RoomTag` |
| Mid-video open loop ("Wait for the best part") | `plan.ts` `rehook`, `overlays.tsx` `ReHook` |
| Price stays on screen for anyone who joins mid-video | `overlays.tsx` `PriceChip` |
| Ends on a genuine price question, then fades back to frame 0 for a seamless loop | `overlays.tsx` `EndCard`, `FenlyViralTour.tsx` `LoopBridge` |
| Text inside the safe zone (y 230-1420, x 72-920) | `theme.ts` `SAFE` |
| No watermark by default; clean MP4 per platform | `plan.showWatermark = false`, `exportVideo.ts` |
| Caption: price question, specs, a soft "know someone?" nudge, 5 hashtags | `copy.ts` `buildSocialCaption` |
| AI copy never says who should live there (fair-housing advertising rules) | `copy.ts` `violatesFairHousing` |
| Whooshes and pops are original, synthesized for Fenly | `public/sfx/*.wav` |

## Posting checklist (shown in the editor)

1. Upload the MP4 to each app directly (no reposted TikTok downloads on Reels).
2. Add a trending sound inside TikTok / Reels at low volume. Business accounts
   can only pick from the commercial sound library.
3. Paste the caption (copied automatically when you tap Share).
4. Reply to the first comments about the price: real back-and-forth is not
   engagement bait and helps the video travel.

## Audit log

| Date | Tour (real app path: host's clips, saved analysis + Gemini notes) | Length | Score | Lost points |
| --- | --- | --- | --- | --- |
| Nov 20, 2026 | 5 clips | 27.6 s | 19/20 | Room openings (1): door edges at the bathroom and closet cuts; scan notes are ~1.3 s apart, too coarse to step off every edge |
| Nov 20, 2026 | 3 clips (Quick Tour) | 20.5 s | 19/20 | Room openings (1): the second kitchen moment opens on the dining table. Shorter because the living room and bathroom vanity have a person in frame (retakes, not editing, fix that) |
