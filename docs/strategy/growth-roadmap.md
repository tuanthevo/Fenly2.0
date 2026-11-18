# Fenly growth roadmap: turning demand into supply

Goal: more people download and keep using Fenly. Monetization is out of scope.
Written November 2026 for the current codebase (in-memory data, no accounts
yet, House OS demo, viral video editor, verification routes).

## 1. The one-paragraph strategy

Rooms are the scarce side; seekers are abundant. So we acquire supply where it
is cheapest and most motivated (the **outgoing roommate**, who must find a
replacement), we let every listing recruit its own audience (the outgoing
roommate shares a Fenly link and video in the places they already post), we
turn the seekers who lose a room into **House Pods** that go after whole
apartments (abundant demand manufactures supply), and we keep whole
households in the app between moves with **House OS** (bills, rent records),
so the next move-out is a one-tap listing instead of a Craigslist post.

```
Outgoing roommate ─ shares link + video ─▶ seekers install Fenly ─▶ 1 gets the room
        │                                                     │
        └─ invites housemates to vet applicants               └─ the other 9 ─▶ House Pods ─▶ invite friends
                       │                                                            │
                       ▼                                                            ▼
              House OS (bills, rent)  ◀───────── pods sign a lease, move in, become a House
                       │
                       └─ someone gives notice ─▶ "Publish your saved room tour" ─▶ (loop)
```

Every arrow is an acquisition channel that costs us little: the outgoing
roommate, the housemates, pod members and the house itself each bring people.

## 2. The people, in their shoes

### Outgoing roommate (supply, most urgent)
- **Needs:** a replacement before move-out so they don't lose the deposit or
  pay double rent; permission from the landlord / housemates; little effort
  during a stressful move.
- **Wants:** serious applicants only (no flakes, no scams); to not be the bad
  guy with the housemates; something back for the effort.
- **Nice to have:** moving help (boxes, cleaning), a reference for their next
  place.
- **Where they post today:** Facebook housing groups, Reddit, Craigslist,
  group chats, Instagram stories. *We do not fight these channels; we give
  them a better link to post there.*

### Remaining housemates
- **Needs:** a say in who moves in; the new person pays reliably; safety.
- **Wants:** to see applicants' verification and vibe without 20 DMs; easy bill
  splitting; no awkward money conversations.
- **Nice to have:** chores, house rules, credit for paying rent on time.

### Room seeker (demand, abundant)
- **Needs:** real, available rooms (no scams); clear total cost; fast replies;
  a fair shot (not ghosted).
- **Wants:** video tours, to know the roommates, one reusable verified
  profile, a backup plan when they lose a room.
- **Nice to have:** commute and neighborhood info, move-in date flexibility.

### Pod member (seeker who teams up)
- **Needs:** co-tenants who will actually pay (verified ID, income), matching
  budget, area and move-in date; a landlord who accepts a group.
- **Wants:** compatibility (sleep, cleanliness, guests, pets, WFH), a group
  chat, a shared shortlist of whole units, one application for the group.
- **Nice to have:** tour scheduling, splitting the deposit and first bills.

### Whole-unit landlord / property manager (indirect, never pays us)
- **Wants:** a qualified group with one combined application (IDs verified,
  combined income ≥ 3x rent, credit/background done). A pod packet that
  arrives "ready to sign" is why they say yes, and why they come back to
  Fenly for the next vacancy.

## 3. Options for each idea, and what we pick

Scoring (1-5): **Acq** = new installs it drives; **Effort** = build cost
(5 = cheap); **Risk** = legal / trust / fraud exposure (5 = low risk).

### Idea A: Fast-Fill (pay the outgoing roommate)
| Option | Acq | Effort | Risk | Notes |
| --- | --- | --- | --- | --- |
| A1. Reward for posting a listing | 2 | 5 | 2 | Pays for fake / duplicate listings; no distribution. |
| **A2. Reward unlocked by 3 verified applicants through *their* link** | **5** | **4** | **4** | Each listing must recruit seekers into Fenly. Verification makes fraud costly. **Pick.** |
| A3. Reward only when the room is filled | 3 | 3 | 5 | Too slow and out of their control; motivation fades. Offer as a bonus tier later. |
| A4. Non-cash reward (moving boxes / cleaning credit) instead of $50 | 4 | 4 | 5 | Cheaper, still motivating. Let the user choose cash-equivalent or perk. |

**Decision:** A2 with A4 as the reward menu. Required: a 15-second "Quick
Tour" mode (3 guided shots: room, shared space, bathroom), a shareable public
listing page with the video, a referral link per listing, housemate approval,
and a landlord-permission checkbox.

### Idea B: House Pods (manufactured supply)
| Option | Acq | Effort | Risk | Notes |
| --- | --- | --- | --- | --- |
| B1. Open pod marketplace from day one | 3 | 2 | 2 | Empty-room problem: pods need density in one area. |
| **B2. "Didn't get the room? Start a pod" offered to the runners-up of a listing** | **4** | **4** | **4** | Rescues the 9 who lost; they already share area, budget and date. **Pick first.** |
| **B3. Bring-your-own pod: invite 1-2 friends, Fenly fills the last seat** | **5** | **4** | **4** | Every pod invite is a referral. **Pick with B2.** |
| B4. Fenly lists whole units (Zillow integration) | 2 | 1 | 2 | Zillow data licensing is restrictive; skip. Pods paste links to units they find anywhere. |

**Decision:** B2 + B3. Pods get a group chat, a shared shortlist (paste any
Zillow / Apartments.com link), a combined **Pod Packet** (verified members,
combined income vs. rent, move-in date) shareable with a landlord by link.
Matching uses lifestyle and logistics only (budget, area, date, sleep,
cleanliness, guests, pets, smoking, WFH). Never protected traits.

### Idea C: House OS before anyone moves
| Option | Acq | Effort | Risk | Notes |
| --- | --- | --- | --- | --- |
| **C1. Bill split without moving money (who owes what + Venmo / Zelle / PayPal links, reminders)** | **4** | **4** | **5** | Whole household installs; no money transmission to build. **Pick.** |
| C2. Fenly collects and pays bills | 3 | 1 | 1 | Payments licensing and support load. Later, via a partner, if ever. |
| C3. Rent-credit reporting | 3 | 2 | 3 | Strong retention, but needs a reporting partner and verified rent payments. Phase 4 via partner. |
| **C4. Move-out moment: "Alex is moving out" → publish the saved room tour to pre-verified seekers** | **5** | **3** | **4** | The payoff that connects House OS back to supply. **Pick.** |

**Decision:** C1 now, C4 when houses have members, C3 later. The house keeps
an always-ready **saved room tour** per room (re-recordable any time).

## 4. Roadmap

Phases are ordered by what grows the user base soonest and by dependency.
Estimates assume one founder working with Claude Code.

### Phase 0: Foundation (1-2 weeks). Nothing below works without it.
- Accounts (Supabase Auth: email magic link + Google; phone later).
- Database tables for users, listings, applications, houses, pods (Supabase,
  row-level security on every table).
- Video and thumbnail upload to Supabase Storage (today published videos are
  temporary `blob:` URLs that vanish on refresh).
- Public, shareable listing pages: `/l/:listingId` works signed out, shows the
  video, price and an "Apply on Fenly" button.
- Referral attribution: `?ref=<code>` stored at first visit, attached at
  sign-up and application.
- Analytics events (see section 6) in one `track()` helper.
- Notifications: email first (Supabase or Resend); web push later.

### Phase 1: Fast-Fill (2-3 weeks). Supply that brings its own demand.
- Entry: "Moving out? Fill your room fast" on Home and in Create Listing.
- Quick Tour: 3 guided 5 s shots → the existing editor's Teaser.
- Landlord check: "My lease lets me find a replacement / my landlord agreed"
  (required), housemate invite links ("Help pick your next housemate").
- Share kit: listing link + exported video + caption, one tap to copy for
  Facebook groups, Reddit, Instagram, group chats.
- Bounty tracker: "2 of 3 verified applicants". An applicant counts only when
  they sign up through the link, pass ID verification and are not a housemate
  or a duplicate (same phone / device / payment fingerprint). Cap one bounty
  per room per 90 days. Reward chosen from a menu (cash card, boxes,
  cleaning), fulfilled manually at first.
- Housemates see applicants (verification badges, compatibility answers,
  video intro optional) and vote; the outgoing roommate picks.

### Phase 2: House Pods (3-4 weeks). Keep the 9 who lost.
- When a listing fills, every other applicant gets: "This room is taken.
  3 people near Mission District with your budget want to team up for a
  whole place. Start a pod?"
- Pod creation: target size (3 or 4), budget per person, areas, move-in
  window; invite friends by link (each invite is a referral).
- Matching suggestions for open seats from verified seekers with overlapping
  budget, area and dates, plus lifestyle answers. Members accept each other
  mutually before anyone sees contact details.
- Pod space: group chat (reuse DirectMessaging), shared shortlist of unit
  links with votes, Pod Packet share page for landlords.
- Safety: everyone verified before joining; report / leave / block.

### Phase 3: House OS habit + move-out trigger (2-3 weeks)
- A House is created automatically when a Fast-Fill room fills or a pod signs
  a lease, or manually ("Add my house").
- Bill split C1: upload a bill (existing PG&E parser), split rules, who owes
  what, payment app links, monthly reminders.
- Saved room tours per room, recorded any time.
- Move-out trigger: a member sets a move-out date → housemates get "Alex is
  moving out on Jan 31. Publish the room tour to verified seekers?" → Fast-Fill
  flow, prefilled.

### Phase 4: Later (after the loops work)
Rent-credit reporting via a partner, landlord accounts for repeat vacancies,
moving perks marketplace, pod tour scheduling, more cities.

## 5. Go-to-market for acquisition

- **One corridor first** (e.g. Mission / Noe / Bernal in SF): density makes
  pods match and makes the move-out trigger matter. Do not open a second area
  until a pod forms within 7 days of a listing filling.
- **Ride the existing channels:** the outgoing roommate posts their Fenly
  link in the housing groups they would post in anyway. Every seeker who
  clicks lands on a public listing page and signs up to apply.
- **Timing:** peak move-out months (May-September, December-January),
  graduating students, lease-end dates.
- **The viral video is the ad:** every Fast-Fill listing produces a vertical
  video the roommate can post on TikTok / Reels; the end card says "Tour it on
  Fenn".

## 6. Metrics (acquisition only)

| Loop | Metric | Early target |
| --- | --- | --- |
| Fast-Fill | Sign-ups per Fast-Fill listing | ≥ 8 |
| Fast-Fill | Listings reaching 3 verified applicants | ≥ 50% |
| Fast-Fill | Housemates who join per listing | ≥ 1 |
| Pods | Runners-up who start or join a pod | ≥ 20% |
| Pods | Friend invites per pod that convert | ≥ 1 |
| House OS | Houses active monthly (≥ 1 bill split) | grows month over month |
| House OS | Move-outs published through the trigger | ≥ 30% of move-outs in active houses |
| Overall | Viral coefficient k = invites per user × invite conversion | > 0.5 early, > 1 is the dream |

Events to track: `listing_link_opened`, `signup_completed{ref}`,
`id_verified`, `application_submitted{listing, ref}`, `bounty_progress`,
`housemate_invited`, `housemate_joined`, `pod_offer_shown`, `pod_created`,
`pod_invite_sent`, `pod_member_joined`, `pod_packet_shared`, `house_created`,
`bill_split_created`, `moveout_set`, `moveout_published`.

## 7. Guardrails

- **Fair housing:** matching and filters use lifestyle and logistics only;
  never race, religion, national origin, sex, familial status, disability or
  other protected traits, and no free-text "preferences" that invite them.
  Keep `violatesFairHousing` on all generated and user listing copy.
- **Leases:** Fast-Fill requires the outgoing roommate to confirm the lease /
  landlord allows a replacement. Fenly never advises breaking a lease.
- **Rewards:** paid only for verified, unique applicants; cap and log every
  payout. Check tax and promotion rules with a lawyer before cash payouts
  (perks first is simpler).
- **Privacy:** contact details hidden until mutual acceptance; verified
  status shown as badges, never the underlying documents; secrets stay
  server-side (see CLAUDE.md).
- **Trust:** report / block everywhere; rate limits on invites and
  applications.

## 8. Claude Code prompts, one per phase

Run one phase at a time on its own branch. Each prompt assumes this file is at
`docs/strategy/growth-roadmap.md`.

**Phase 0**
> Read `docs/strategy/growth-roadmap.md` and `CLAUDE.md`. Implement Phase 0
> (Foundation) only, on branch `feat/growth-foundation`. Start in plan mode:
> list the Supabase tables (with row-level security policies), routes,
> components and env vars you will add, and wait for my OK. Then build in
> small commits, keeping existing pages, brand colors and layout. Keep the
> current demo data working when the user is signed out. Add tests for every
> pure helper (referral attribution, track()). Tell me exactly which SQL to
> run in the Supabase dashboard and which env vars to set; never print or
> commit secrets.

**Phase 1**
> Read `docs/strategy/growth-roadmap.md` (sections 2-4 and 7). Implement
> Phase 1 (Fast-Fill) on branch `feat/fast-fill`, on top of Phase 0. Plan
> mode first. Reuse GuidedShotCapture (add a 3-shot Quick Tour mode) and the
> viral editor's Teaser. Verified-applicant counting must be server-side and
> unit tested (duplicates, housemates, unverified, cap). Rewards are recorded
> for manual fulfillment, no payments code.

**Phase 2**
> Read `docs/strategy/growth-roadmap.md`. Implement Phase 2 (House Pods) on
> branch `feat/house-pods`. Plan mode first. Matching may only use the
> lifestyle and logistics fields listed in section 3 B; add a test that fails
> if a protected-trait field is added. Contact details stay hidden until
> mutual acceptance. Reuse DirectMessaging for pod chat.

**Phase 3**
> Read `docs/strategy/growth-roadmap.md`. Implement Phase 3 (House OS habit +
> move-out trigger) on branch `feat/house-os-loop`. Plan mode first. Reuse
> HouseOsView and `/api/gemini/parse-utility-bill`. No money movement: show
> who owes what with Venmo / Zelle / PayPal links. The move-out trigger
> pre-fills the Phase 1 Fast-Fill flow with the room's saved tour.
