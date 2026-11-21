# Fenly CEO operating plan: from prototype to a fundable company

Owner: CEO (solo founder, building and operating with AI).
Written November 2026. Companion to `growth-roadmap.md`; this plan replaces
its build order where they differ.

**Targets in this plan are goals to test, not benchmarks.** Replace them with
real numbers after each gate.

---

## Part 1. The decisions that shape everything

### 1.1 What Fenly is (and is not)

**Positioning:** *Fenly is the fastest, safest way to fill or find a room in a
shared home.*

- **What brings users in:** the free AI room-video tool. Anyone filling a room
  gets a TikTok-style tour and a listing link in minutes.
- **What creates value:** the room gets filled, with verified people, quickly.
- **What keeps users:** a portable **Renter Passport**: verified ID, rent
  payment history and housemate references that carry from move to move.
- **What keeps deals on Fenly (later):** money flows through Fenly, for example
  deposits and first month's rent via a licensed payments partner, and a
  Fill Guarantee for outgoing roommates.

**Not:** a "Tinder for roommates", an AI chatbot app, a property-management
suite or a Zillow clone. The roommate startups that stalled (Roomi, Room8,
Apartment List Roommates, BeRoomie) built ways to meet people. Flip/Caretaker
survived by taking responsibility for the outcome. Fenly is built around the
outcome from day one.

### 1.2 The one loop we build and measure

```
Outgoing roommate needs a replacement
  → makes a free video + listing link on Fenly (5 minutes)
  → posts it where they already post (Facebook groups, Reddit, TikTok, group chats)
  → seekers open the link, create a Passport, apply
  → roommate and housemates pick someone; the room fills
  → new tenant and housemates keep their Passports (rent history, references)
  → next move-out in that house starts on Fenly
```

Every feature must strengthen this loop. Anything else is hidden.

### 1.3 North-star and supporting metrics

- **North star:** rooms filled through Fenly per week in the launch area.
- **Supply:** new fill requests per week; % that come in organically (not from
  founder outreach).
- **Demand:** applications per listing; median days to fill.
- **Quality:** % of fills where both sides rate the match 4+/5 after 30 days.
- **Retention:** Passports still active after 60 days (rent recorded, profile
  updated, a reference given).
- **Virality:** new users who arrive through a shared Fenly link or video.

### 1.4 Where we start

**Primary launch area: San Francisco's Mission, Noe Valley and Bernal Heights.**
Why:
- California has the highest share of room listings in the US (Zillow).
- Dense shared housing, young renters, constant turnover.
- Active Facebook housing groups and r/SFBayHousing to meet listers where they are.
- Close enough to meet people, film examples and run events in person.

**Backup area:** Berkeley / North Oakland (student and new-grad turnover in
May-August and December-January).

**Rule:** no second area until the launch area hits the Gate 2 numbers
(Part 3).

---

## Part 2. The app revamp

### 2.1 Principles
1. **Hide, don't delete.** Existing features (AI staging, Ask Fenn, mascots,
   lease generator, House OS extras, Scout) go behind feature flags so the
   main path is simple. Nothing is removed from the codebase.
2. **Three jobs, three entry points:** **Fill a room**, **Find a room**,
   **My Passport**.
3. **Works signed out until it matters.** Anyone can watch tours and open a
   listing link; sign-up happens at "Apply" or "Publish".
4. **Mobile web first, app stores second.** Ship as an installable web app
   (PWA). Wrap it for the App Store / Play Store (e.g. Capacitor) once
   retention justifies it. Listing links must open instantly in any phone
   browser.
5. **Trust shown, documents hidden.** Badges for verified phone, ID and rent
   history; the underlying documents stay private.

### 2.2 New navigation (replaces the current bottom bar for most users)

| Tab | For | What's there |
|---|---|---|
| **Find** | Seekers | Vertical feed of rooms in the launch area, filters (price, move-in, area), saved rooms |
| **Fill** | Outgoing roommates / hosts | "Fill my room" flow, my listings, applicant inbox, share kit, fill status |
| **Inbox** | Everyone | Messages with applicants / hosts |
| **Passport** | Everyone | Verification, rent history, references, application profile |

Home, Scout, Ask Fenn and House OS stay reachable from a menu behind feature
flags.

### 2.3 Screen-by-screen

**Fill my room (outgoing roommate), target under 10 minutes total**
1. The basics, one screen (host's call, Nov 2026): the date the room needs
   filling, rent, security deposit (optional, at most two months' rent), then
   the room's facts: neighborhood (address/ZIP or location), beds/baths, size,
   lease term, amenities chips. They come before the tour because the video
   puts them on screen; most are one tap or prefilled.
2. Lease check (required): "My lease or landlord lets me find a replacement" /
   "I'm the leaseholder renting a room" / "Not sure" (shows a short guide;
   can still save a draft).
3. Quick Tour: 3 guided shots of 5 s (room, shared space, bathroom), or upload
   from the camera roll. Optional 2 more shots for the full tour.
4. Describe: AI writes the title and description from the clips; the host
   confirms.
5. AI edit: Teaser (~13 s) and Full tour (~25-30 s), with the existing hook
   styles; the host edits the callouts.
6. Publish: public link `fenly.app/r/<id>`, video download, caption, one-tap
   copy for each channel (Facebook group text, Reddit post template, TikTok
   caption, group-chat message). Each channel gets its own tracked link.
7. Invite housemates (optional): "Let your housemates review applicants."
8. Fill status page: views, applications by channel, days left until
   move-out, nudges ("Repost in X group, it's been 3 days").

**Find (seeker)**
- Feed of local rooms (video autoplay, price, move-in date, verified badges).
- Listing page: video, total monthly cost, move-in date, housemates (first
  names, verified badges, short intros if they agree), house rules, map area
  (not exact address until accepted).
- Apply with one tap using the Passport (pre-filled), plus a short note.
  Optional 15 s intro video.
- After a room fills, applicants get "This room is taken. 4 similar rooms
  nearby," and later "Want to team up for a whole place?" (pods experiment).

**Applicant inbox (host + housemates)**
- One card per applicant: name, photo, verified badges, move-in date, budget
  fit, intro, compatibility answers (lifestyle only).
- Actions: shortlist, message, decline politely (templated), mark as chosen.
- Housemates can thumbs-up or thumbs-down; the leaseholder or host decides.
- AI summary: "3 strong fits: verified ID, move-in matches, budget OK"
  (factual fields only, never protected traits).

**Passport (everyone)**
- Level 1: phone verified, profile (photo, short bio, move-in window, budget,
  lifestyle answers).
- Level 2: government ID verified (for finalists; Fenly pays at first).
- Level 3: rent history (rent paid through Fenly or bank-verified via a
  partner) and housemate references ("Would live with them again").
- Share link for landlords (later).

### 2.4 Technical foundation (build order)
1. Supabase: Auth (magic link, Google, phone OTP), Postgres with row-level
   security, Storage for videos and thumbnails.
2. Data model: `users`, `passports`, `verifications`, `listings`,
   `listing_media`, `listing_links` (channel, code), `link_visits`,
   `applications`, `messages`, `house_members`, `references`, `events`.
3. Public listing pages rendered fast for social previews (Open Graph image
   from the video thumbnail).
4. Video upload pipeline: exported MP4 → Storage → listing; keep the browser
   export (`@remotion/web-renderer`). Server render later if needed.
5. Analytics: `track(event, props)` on the server, plus a weekly metrics view.
6. Notifications: email first, SMS for time-critical items (new applicant,
   move-out reminders). Web push when the PWA ships.
7. Moderation: AI scam and fair-housing checks on every listing and message
   flagged for review; report and block everywhere.
8. Feature flags for everything hidden.

### 2.5 What "owning the money flow" means (Phase 3, not before)
- **Through a licensed payments partner only** (for example Stripe Connect or
  a rent-payments provider); Fenly never holds funds itself.
- **Step 1:** first month's rent and deposit paid through Fenly to the
  leaseholder, with a receipt in both Passports. Check state deposit rules
  (in California, Civil Code §1950.5) with counsel.
- **Step 2:** monthly rent through Fenly (optional) → builds rent history for
  the Passport and credit reporting via a partner (Credit Boost).
- **Step 3: Fill Guarantee pilot.** For listings meeting quality rules, if no
  verified applicant is found by move-out, Fenly covers a limited gap (for
  example, a capped amount) or keeps working the listing for free. Price and
  limits are decided only after we have fill-rate data.

---

## Part 3. The step-by-step plan, with gates

Each phase ends with a **gate**: if the numbers are not there, we fix or pivot
before spending more.

### Phase 0. Prove it by hand (weeks 1-4, no new code)

Goal: learn whether outgoing roommates want this and whether their links bring
seekers. Follow the concierge test in detail:

**Week 0 (setup, 3-4 days)**
1. List every channel in the launch area: Facebook housing groups (SF), r/SFBayHousing,
   Craigslist rooms, Nextdoor, university boards; note each group's rules.
2. Message admins of the 5 biggest groups: introduce Fenly, offer free videos
   for their members, ask what's allowed.
3. Build the kit: listing page template (Carrd/Notion or generated pages),
   apply form (Tally) with hidden listing and channel fields, tracked links,
   tracking spreadsheet, outreach scripts, consent text, interview guide.
4. Set the limits: no cash per applicant; the roommate chooses; no money
   handled; data deleted after the test; lease permission confirmed.

**Weeks 1-3 (run)**
5. Every day: find people posting "room available / replacement / take over my
   lease" in the launch area; reply or DM with the free video offer.
6. Turn each room around in 24 hours: clips → Fenly editor → video + listing
   page + caption + tracked links.
7. Send applicants to the roommate daily; log every step.
8. After each fill: ask runners-up about teaming up; ask housemates and the new
   tenant about a rent-history / credit waitlist.
9. Interview 5 roommates, 5 seekers, 2-3 housemates (gift card for the
   interview only).

**Week 4 (decide)**
10. Fill in the results.

**Gate 1 (goals):** 10+ rooms sourced; at least 5 applications per room on
average; 60%+ of roommates would recommend; at least some rooms filled faster
than the roommate expected.
- **Pass:** build Phase 1.
- **Partial:** fix the weakest step (offer, video, apply form, channel) and
  rerun for 2 weeks.
- **Fail:** test another supply source (small landlords with rooms, campus
  housing offices) before writing code.

### Phase 1. Revamp v1: "Fill my room" (weeks 5-12)

Goal: replace the manual kit with the app, in the launch area only.

1. **Week 5:** Supabase foundation (auth, tables, storage, row-level security),
   feature flags, `track()`. Hide non-core features behind flags.
2. **Week 6:** Fill flow (Quick Tour, details, AI edit, publish) writing to the
   database; public listing pages with social previews.
3. **Week 7:** Share kit with tracked links per channel; fill status page.
4. **Week 8:** Find feed (launch area), listing page, Passport Level 1, one-tap
   apply.
5. **Week 9:** Applicant inbox, housemate invites and votes, messages,
   notifications.
6. **Week 10:** Passport Level 2 (ID check for finalists via a verification
   vendor), moderation (scam and fair-housing checks), report/block.
7. **Week 11:** PWA install prompt, performance on phones, analytics dashboard.
8. **Week 12:** Move every Phase 0 user onto the app; run Fill the same way,
   now self-serve.

**Gate 2 (goals, launch area, 4 weeks after launch):**
- 15+ new rooms per week, more than half not from founder outreach.
- Median days to fill under 14.
- 30%+ of new users arrive through a shared Fenly link or video.
- **Pass:** Phase 2 and start pre-seed conversations.
- **Fail:** find the broken step in the funnel (Part 6) before adding features.

### Phase 2. Make people stay (months 4-6)

1. **Passport Level 3 (references):** after 30 days in a home, both sides
   leave a short reference ("Would live with again", pays on time, clean, quiet).
2. **Move-out notice tracking:** each house member can set their lease end or
   notice date; 30 days before, housemates get "Publish this room on Fenly."
3. **Saved room tours:** a house keeps its latest tour per room, re-recordable.
4. **Credit Boost waitlist → partner:** pick a rent-reporting partner; start
   with people paying rent through a bank-verified connection.
5. **Pods experiment ("bring 1-2 friends, Fenly fills the last seat"):**
   group profile, shared shortlist of whole units (links from anywhere),
   combined application page for landlords. Run it for one season and measure
   whether pods sign leases.

**Gate 3:** 40%+ of Passports active after 60 days; move-outs in Fenly houses
publish on Fenly at least half the time; at least a few pods sign leases (if
not, pause pods).

### Phase 3. Own the money flow (months 6-9)

1. First month's rent and deposit through a licensed payments partner, with
   receipts in both Passports.
2. Optional monthly rent through Fenly → rent history → credit reporting via
   partner.
3. Fill Guarantee pilot with strict quality rules and caps.
4. Lawyer review before launch: payments, deposits, consumer-reporting
   (background checks), fair housing, referral rewards, terms of service.

**Gate 4:** a meaningful share of fills pay through Fenly; deals leaving the
platform go down; guarantee costs stay inside the cap.

### Phase 4. Expand and raise (months 9-15)

1. Write the **launch-area playbook** (channels, group partnerships, content,
   week-by-week tasks) from what worked.
2. Open the next two areas in the same city (Oakland/Berkeley, Inner
   Sunset/Richmond), then one new city with similar renters (for example LA's
   Koreatown/Silver Lake or NYC's Brooklyn).
3. Room-level rent index pages per neighborhood ("What a room in the Mission
   costs, November 2026") from listings and paid rent, for search traffic.
4. Native app store release (wrapper around the PWA) once 60-day retention
   holds.
5. Raise a seed round on the numbers (Part 8).

---

## Part 4. Marketing and go-to-market

### 4.1 Supply first: outgoing roommates
- **Reply where they already post.** Every day, search launch-area groups and
  subreddits for move-out posts; reply with the free video offer (within each
  group's rules). Template the replies; send them by hand.
- **Group partnerships.** Offer admins: free videos for members, a weekly
  "rooms in the Mission" roundup they can post, a scam-checked badge.
- **Lease-end timing.** Push hardest from April to August and in December.
- **Partnerships that see move-outs first:** local movers, cleaners, storage
  units, university housing offices, startup HR teams (relocations). They get
  a referral link and a perk for their customers.
- **Perks instead of cash:** moving boxes, a cleaning discount or priority
  placement for filled rooms (after a lawyer reviews any cash reward).

### 4.2 Demand: seekers come through the listings
- Every listing link is an ad; every video ends with "Tour it on Fenn".
- **Fenly's own TikTok and Instagram:** 3-5 posts a week reusing listers' videos
  (with permission), always in the "What $X gets you in [neighborhood]" format.
  One recognisable format, posted consistently.
- **Room-rent explainers:** short videos and pages ("Rooms in the Mission:
  $1,200-$1,800 this month"), from Fenly's own listing data.
- **New-to-city funnels:** grad programs, new-hire groups, international
  student offices. "Moving to SF? See verified rooms with video before you
  arrive."

### 4.3 Referral and word of mouth
- Seekers who get a room: "Your old roommates need someone? Send them Fenly."
- Housemates: "Next time someone moves out, it's one tap."
- Passport share links show "Verified on Fenly" to anyone they're sent to.

### 4.4 Budget (first 6 months)
- Concierge test: about $200-500 (interview gift cards, form/page tools).
- Verification checks for finalists: paid by Fenly, budget per month and cap it.
- Perks: moving boxes / cleaning partnerships, negotiated per partner.
- No paid ads until Gate 2 shows organic growth; then small tests only.

---

## Part 5. Running the company with AI

| Job | How AI does it | Human check |
|---|---|---|
| Building the app | Claude Code from the briefs in `docs/briefs/`, one phase per branch, tests required | Founder reviews each plan and tests each release on a phone |
| Listing production (Phase 0) | Fenly editor + AI copy | Founder reviews every video before sending |
| Listing quality and scams | AI checks every new listing: duplicate photos, price far below area range, off-platform payment requests, fair-housing wording | Flagged items reviewed daily |
| Applicant summaries | AI turns applications into factual cards (verified fields, move-in, budget fit) | Never ranks people by protected traits; leaseholder decides |
| Outreach | AI finds new move-out posts and drafts replies | Founder sends replies by hand (no automated posting or DMs) |
| Content | AI cuts weekly "What $X gets you" posts from lister videos | Permission logged; founder approves |
| Support | AI drafts answers from a help-doc knowledge base | Escalate money, safety and legal questions to the founder |
| Metrics | Weekly automated digest from `events`: funnel, fills, days to fill, channel performance | Founder reviews every Monday |
| Research and legal prep | AI drafts questions and summaries | A licensed lawyer gives the answers |

**Weekly operating rhythm**
- **Monday:** metrics digest, pick the one funnel step to improve this week.
- **Tuesday-Thursday:** build (Claude Code) and outreach (1-2 h/day).
- **Friday:** user interviews (2-3), ship, write a short weekly update (useful
  later for investors).

---

## Part 6. The funnel to watch (and what to do when a step breaks)

| Step | Metric | If low, try |
|---|---|---|
| Move-out post seen → reply | Posts found per day | More groups, earlier in the day, partner admins |
| Reply → started a Fill | Reply-to-start rate | Simpler offer, show an example video, faster turnaround |
| Started → published | Completion rate | Fewer fields, Quick Tour only, save drafts |
| Published → shared | Links shared per listing | Better share kit, prewritten posts per channel |
| Link opened → applied | Apply rate | Fewer fields, apply without ID, show housemates and total cost |
| Applied → filled | Fill rate, days to fill | Applicant summaries, reminders, housemate voting |
| Filled → active Passport | 60-day activity | References, rent history, move-out tracking |

---

## Part 7. Legal and trust checklist (before each phase launches)

- Company set up (e.g. Delaware C-corp), terms of service, privacy policy,
  CCPA-ready data deletion.
- **Fair housing:** matching and filters use lifestyle and logistics only; no
  protected traits; AI checks listing and generated copy; a lawyer reviews
  the matching questions.
- **AI-written listing copy:** the host confirms and edits every listing;
  keep a record that they approved it. Ask counsel how this affects platform
  liability protections.
- **Background and ID checks:** use a consumer-reporting vendor with proper
  consent and permissible purpose; show badges, not reports, to housemates.
- **Sublets and lease takeovers:** lease-permission confirmation required;
  short guides per city (San Francisco has its own rules).
- **Referral rewards:** perks first; cash only after a lawyer confirms it
  doesn't require a real-estate license and handles tax reporting.
- **Payments and deposits:** only through a licensed partner; follow state
  deposit rules.
- **Safety:** report/block, meeting-safety tips, scam warnings, response time
  target for reports.
- **Insurance:** general liability; check options before any guarantee.

---

## Part 8. What makes a VC invest, and when to raise

**Pre-seed (after Gate 2, around month 4):** raise a small round to fund
Phases 2-3. What to show:
- The loop working in one area: weekly fills growing without paid ads.
- Supply arriving organically; days to fill dropping.
- Share of users arriving through Fenly links and videos.
- Interviews and quotes from outgoing roommates.
- Clear answers to "why now / why you": short-form video distribution and AI
  editing make listing creation effortless; trust and the Passport make Fenly
  defensible; the roommate startups that stalled lacked both.

**Seed (after Gate 4, around month 12-15):** show
- Multiple areas working with the same playbook.
- Retention: active Passports, repeat moves on Fenly.
- Money flowing through Fenly and deals leaving the platform going down.
- A credible path to revenue (fees on payments, guarantees, landlord tools),
  even if it's not switched on yet.

**Data room checklist:** weekly metrics since launch, funnel by channel,
cohort retention, interview notes, legal reviews, product roadmap, team plan.

---

## Part 9. Kill and pivot criteria

- **Gate 1 fails twice** in two different areas → the outgoing-roommate wedge
  is wrong; test small landlords or a campus partner.
- **Links don't bring seekers** (under 2 applications per room) → the video is
  not the hook; test pricing transparency or verified-only listings instead.
- **Passports go inactive after the move** → retention needs rent payments
  first; move Phase 3 earlier.
- **Leakage stays high after payments launch** → strengthen the guarantee or
  shift to serving small landlords directly.

---

## Part 10. Claude Code prompts

Run one at a time, on its own branch, in plan mode first.

**Phase 1A: foundation and focus**
> Read `docs/strategy/ceo-operating-plan.md` (Parts 2 and 7) and `CLAUDE.md`.
> On branch `feat/v1-foundation`, implement section 2.4 steps 1-2, 5 and 8:
> Supabase auth (magic link, Google, phone OTP), tables with row-level
> security, storage for videos, a server-side `track()` helper, and feature
> flags. Hide (don't delete) Home extras, Scout, Ask Fenn, AI staging and
> mascots behind flags; keep brand colors and layout. Start in plan mode with
> the full list of tables, policies, env vars and files; wait for my OK. Give
> me the SQL to run in Supabase. Add tests for every pure helper. Never print
> or commit secrets.

**Phase 1B: Fill my room**
> Read `docs/strategy/ceo-operating-plan.md` section 2.3 ("Fill my room") and
> Part 3 Phase 1 weeks 6-7. On branch `feat/fill-my-room`, build the Fill flow
> on top of the foundation: two-question start, required lease check, Quick
> Tour (3 guided 5 s shots, reuse GuidedShotCapture), prefilled details with
> AI title/description (existing route), the viral editor (Teaser + Full
> tour), upload of the exported MP4 to storage, a public listing page
> `/r/:id` with Open Graph previews, a share kit with one tracked link per
> channel, and a fill status page. Plan mode first.

**Phase 1C: Find, Apply, Inbox, Passport L1-2**
> Read `docs/strategy/ceo-operating-plan.md` section 2.3 and Part 7. On branch
> `feat/find-apply-passport`, build the Find feed for the launch area, listing
> page, Passport Level 1 and one-tap apply, the applicant inbox with housemate
> invites and votes, notifications, and Passport Level 2 (ID check for
> finalists via the existing verification route). Applicant summaries use
> factual fields only; add a test that fails if a protected-trait field is
> used in matching or summaries. Plan mode first.

**Phase 2: retention**
> Read Part 3 Phase 2. On branch `feat/passport-retention`, add references,
> move-out notice tracking with the 30-day "publish this room" prompt, saved
> room tours per house, and the Credit Boost waitlist. Plan mode first.

**Phase 3: payments** (only after a lawyer review)
> Read Part 2.5 and Part 7. On branch `feat/payments`, integrate the chosen
> licensed payments partner for first month's rent and deposit with receipts in
> both Passports. Fenly never holds funds. Plan mode first; list every legal
> assumption for me to confirm with counsel.
