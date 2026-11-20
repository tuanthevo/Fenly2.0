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

Targets after the November 2026 updates: 30-45 s (rooms aim for 7 s, the perk for 5 s, the end card 3.5 s). Rooms still shrink to their clean footage, so real clips with doorways or edges give shorter tours. Long clips are no longer thrown away: a room with 10 s+ of clean footage plays as **two moments** of ~5.5 s from different parts of the clip, joined by a zoom cut (whips stay for room changes); the opener's room gets a tour moment after the headline when there's 4 s+ footage left; a closer that isn't the perk gets a moment before its reveal. Extra moments are dropped, last first, past 45 s. Host test (5 phone clips, 7-20 s): 35.4 s → 43.5 s; Quick Tour with 3 of them: 21.5 s → 31.0 s. The table below describes the beats; the exact targets live in `plan.ts` `LENGTH_PRESETS`.

| Section | Length | Speed | What's on screen | Why |
| --- | --- | --- | --- | --- |
| Hook | headline reading time: 1.2 s + 0.22 s/word + 0.3 s per number, 2.5-3.2 s (≈3.0 s for "What $1,450/mo gets you in Mission District") | 1.0x, no ramp | best frame of the best shot, price + place headline, slow settle from 1.12x zoom | viewers decide in 0-3 s; frame 0 is also the cover |
| Answer | ≈3 s, same shot keeps rolling | 1.0x (0.85x if footage is short) | "1 bed · 1 bath", "220 sq ft", best amenity, popping in 0.2 s apart; price chip appears | pays off the hook's question right away |
| Each room | ≈7 s, or two ≈5.5 s moments for long clips (shorter when the clip has less clean footage, never under 2.6 s) | matched to camera movement, 0.85-1.15x, calm by default (target motion 0.05: a fast camera is slowed down), no ramp | room tag at 0.3 s and a second callout at ~2.3 s; a second moment shows the room's detail right after the zoom cut | the host wants slow, natural motion; the cut and callouts carry the change rate |
| Re-hook | 1.2 s, on the room nearest 45% of the runtime | | "Wait for the best part" | carries viewers through the mid-video dip |
| Perk | ≈3.4 s | 0.85x slow motion, no ramp | "THE BEST PART" + the perk, big | the payoff gets the slow, readable moment |
| End card | ≈3.2 s | footage keeps rolling (may hold its last frame here only) | price question, place, specs, "Tour it on Fenly" | ~10 words need ~3 s to read |
| Loop | last ~0.3 s | | the opening shot fades back in | the replay starts seamlessly |

Pace scales the sections: snappy ×0.85, relaxed ×1.15. The teaser keeps the
hook (≈2.3 s) and runs ~2.2 s rooms at 1.0-1.25x with no ramps (≈13 s); it
never splits rooms.
Guided shots record 7 s so each room has ~5 s of clean footage after the
tap-to-record shake.

### Fenly 2.0 Quick Tour (Fill tab)

The Fill flow films 3 shots of 5 s (room, shared space, bathroom; `guidedShots.ts`
`shotsForMode('quick')`), with 2 optional extras (closet, perk) for a fuller
tour. Rooms shrink to their clean footage, so 3 shots give a ~15-18 s "full"
tour; the full ~25-30 s tour needs the extras. The editor also exports the
~13 s teaser from the same edit (`ViralVideoEditor` `exportTeaserToo`) and both
go to Supabase Storage. Audit (Nov 2026, 3 sample shots via the app export):
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
| Long clips play as two moments of one room, zoom cut between them, 45 s cap | `plan.ts` `planSegments`, `MOMENT_SEC`, `SPLIT_MIN_CLEAN_SEC`, `MAX_TOUR_TOTAL_SEC`; the editor lists one row per room (`editableShots`, `roomDetail`) |
| Video text at 80% (photo tours 64%); story bar at 110 px, above the text safe zone | `plan.ts` `VIDEO_TEXT_SCALE`, `overlays.tsx` `STORY_BAR_TOP` |
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
