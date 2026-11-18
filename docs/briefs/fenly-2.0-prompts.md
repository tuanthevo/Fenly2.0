# Fenly 2.0: Claude Code prompts

Paste these into Claude Code from the `fennly` folder, one at a time, in order.
Wait for each one to finish (and test it on your phone) before the next.

How versions work:
- Today's app is frozen as tag **`v1.0`** (you can always get it back).
- Fenly 2.0 lives on branch **`fenly-2.0`**.
- Each step is built on its own short branch off `fenly-2.0` and merged back
  when it works.

Plan: `docs/strategy/ceo-operating-plan.md`.

---

## Prompt 0: Create Fenly 2.0 (safe starting point)

```
Set up "Fenly 2.0" as a separate version of the app. Don't change any app code in this step.

1. Run `git status`. If there are uncommitted changes, show me the list and commit them on the current branch with the message "Save work before Fenly 2.0" (stage with git add -A -- . ':!.aistudio'; never stage .env*, public/samples/ or out/).
2. Merge the current feature branch into main if it isn't merged yet (show me the branches and ask before merging).
3. On main, create an annotated tag v1.0 with the message "Fenly 1.0: prototype before the 2.0 revamp".
4. Create and switch to a new branch named fenly-2.0 from main.
5. Change the app's display name/version shown in the UI (and "version" in package.json) to 2.0.0, without changing brand colors or layout.
6. Add a "Fenly 2.0" section at the top of CLAUDE.md:
   - Source of truth: docs/strategy/ceo-operating-plan.md.
   - Branch rules: build each step on its own branch off fenly-2.0 and merge back into fenly-2.0 when tests pass; never commit to main; v1.0 is the frozen prototype.
   - Product rules: hide features behind feature flags instead of deleting them; keep brand colors and components; the core loop is Fill a room → share link → Find/Apply → filled.
7. Commit ("Start Fenly 2.0") and show me `git log --oneline -5` and `git tag`.
```

## Prompt 1: Foundation (accounts, database, flags, analytics)

```
Read docs/strategy/ceo-operating-plan.md (Parts 2 and 7) and CLAUDE.md. Create branch feat/2.0-foundation from fenly-2.0.

Build section 2.4 steps 1, 2, 5 and 8 of the plan:
- Supabase Auth: email magic link, Google, phone OTP.
- Postgres tables with row-level security: users, passports, verifications, listings, listing_media, listing_links, link_visits, applications, messages, house_members, references, events.
- Supabase Storage buckets for listing videos and thumbnails (private by default, public read only for published listings).
- A server-side track(event, props) helper writing to events.
- Feature flags (one config file + server check). Hide, don't delete: Home extras, Scout, Ask Fenn, AI staging, mascots, House OS extras.
- New bottom navigation for 2.0: Find, Fill, Inbox, Passport (old tabs reachable from a menu when their flag is on).
- Signed-out users can still browse the demo feed.

Start in plan mode: list every table with columns and RLS policies, every new env var, route and file. Wait for my OK before writing code. Then:
- Give me the exact SQL to run in the Supabase dashboard and the env vars to put in .env.local (server-only secrets never get a VITE_ prefix; never print or commit secrets).
- Add unit tests for every pure helper (flags, track, auth guards).
- Run npm.cmd run lint and the tests; fix failures.
- Commit in small steps, then merge into fenly-2.0 and tell me how to test it on my phone.
```

## Prompt 2: Fill my room (the core of 2.0)

```
Read docs/strategy/ceo-operating-plan.md section 2.3 ("Fill my room") and Part 3 Phase 1 weeks 6-7. Create branch feat/2.0-fill from fenly-2.0.

Build the Fill tab:
1. Two-question start (move-out date, rent for the room).
2. Required lease check: "My lease/landlord lets me find a replacement" / "I'm the leaseholder renting a room" / "Not sure" (short guide, can save a draft).
3. Quick Tour: 3 guided 5-second shots (room, shared space, bathroom), reusing GuidedShotCapture with a mode prop; camera roll upload still works; optional 2 extra shots for the full tour.
4. Details prefilled where possible; AI title and description via the existing /api/gemini/auto-fill-listing-copy route; the host confirms.
5. The existing viral editor (Teaser and Full tour); export the MP4 and upload it to Supabase Storage (no more temporary blob URLs).
6. Publish: public listing page /r/:id that works signed out on any phone, with Open Graph previews from the video thumbnail, price, move-in date, area (not exact address) and an Apply button.
7. Share kit: one tracked link per channel (Facebook group, Reddit, TikTok/Instagram, group chat), prewritten post text for each, download video, copy caption. Record link_visits with the channel.
8. Fill status page: views and applications by channel, days until move-out, nudges.
Track events for every step (fill_started, tour_recorded, listing_published, link_shared, link_opened).

Plan mode first and wait for my OK. Keep brand colors and components; keep fair-housing checks on all listing text. Tests for the pure logic (link codes, attribution, status math). Run lint and tests, commit in small steps, merge into fenly-2.0, and give me a test checklist for my phone.
```

## Prompt 3: Find, Apply, Inbox, Passport

```
Read docs/strategy/ceo-operating-plan.md section 2.3 (Find, Applicant inbox, Passport) and Part 7. Create branch feat/2.0-find-apply from fenly-2.0.

Build:
1. Find feed for the launch area (Mission, Noe Valley, Bernal Heights): real published listings first, demo listings behind a flag; filters for price, move-in date, area; save rooms.
2. Passport Level 1: phone verified, photo, short bio, move-in window, budget, lifestyle answers (sleep, cleanliness, guests, pets, smoking, work from home). No protected traits anywhere.
3. One-tap apply with the Passport plus a short note; optional 15-second intro video; sign-up happens at Apply (attribution kept from the link).
4. Applicant inbox for the host: applicant cards (verified badges, move-in fit, budget fit, intro), shortlist, message, polite decline template, mark as chosen. Housemate invite link with thumbs up/down; the host decides.
5. AI applicant summary using factual fields only. Add a test that fails if a protected-trait field is ever used in matching, filters or summaries.
6. Passport Level 2: ID check for shortlisted applicants via the existing /api/verification/verify-id route; show badges, never documents.
7. Notifications by email (new applicant, chosen/declined, move-out reminders).
8. When a room fills, other applicants get "This room is taken" plus similar rooms nearby.
9. Report and block on listings, profiles and messages; AI scam and fair-housing checks flag listings and messages for my review.
Track events (application_submitted, shortlisted, chosen, room_filled, id_verified).

Plan mode first and wait for my OK. Tests, lint, small commits, merge into fenly-2.0, and a phone test checklist.
```

## Prompt 4: Installable app and launch polish

```
Read docs/strategy/ceo-operating-plan.md Part 2.1 and Part 3 Phase 1 week 11. Create branch feat/2.0-launch from fenly-2.0.

1. Make the app an installable PWA (manifest, icons from the existing brand, offline shell, "Add to Home Screen" prompt after a user publishes or applies).
2. Performance on phones: listing page loads fast on mobile data; lazy-load the editor and video feed.
3. A simple metrics page (behind an admin flag) showing the funnel from section Part 6 of the plan for the last 7 and 28 days.
4. Empty states and onboarding copy for Find, Fill, Inbox and Passport that explain the value in one line each.
5. Accessibility pass (labels, contrast with the existing palette, tap targets).

Plan mode first. Tests, lint, merge into fenly-2.0, then give me a pre-launch checklist (Supabase settings, env vars on Vercel, domain, privacy policy and terms placeholders).
```

---

Later prompts for retention (Phase 2) and payments (Phase 3) are in
`docs/strategy/ceo-operating-plan.md` Part 10. Payments only after a lawyer
review.
