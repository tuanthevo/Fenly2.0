# Fenly viral room-tour playbook

What makes a rental / real-estate short travel, and where each rule lives in
the code. Researched November 2026. Nobody can promise a million views (the
listing itself, the price, timing and luck matter most); the editor removes
the usual reasons a video dies early and packages every listing in a format
that already works.

## How the platforms decide

| Signal | What it means for us | Source |
| --- | --- | --- |
| Finishing a video is one of TikTok's strongest interest signals | Keep it short (≈10 s) and loop it, so completion and rewatches are high | [TikTok Newsroom: How TikTok recommends videos](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/) |
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

## Rules → code

| Rule | Implementation |
| --- | --- |
| Best shot first; price + neighborhood headline fully visible on frame 0 (also the cover) | `plan.ts` `pickHookSlot`, `overlays.tsx` `HookTitle` |
| Hook styles: price hook, guess the rent (price hidden until the end card), POV | `copy.ts` `defaultHook`, `STYLE_INFO` |
| ≈10 s total; a new room every ~1.35 s; hero shots 1.0x, rooms 1.35x | `plan.ts` `PACE_PRESETS`, `SPEED` |
| Cleanest stretch of each clip (no wall, no door edge, no whip pan), auto-brightened | `clipSignals.ts` (tuned on real phone clips, see the fixture test) |
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
