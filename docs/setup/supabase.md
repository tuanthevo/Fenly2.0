# Supabase setup for Fenly 2.0

One-time setup so sign-in, Passports and analytics work. Until it's done the app
runs as the signed-out demo (Passport says "Sign-in isn't set up").

## 1. Create the project
1. https://supabase.com/dashboard → **New project**. Region: West US (close to SF).
2. Save the database password in your password manager (the app never needs it).

## 2. Run the schema
1. Dashboard → **SQL Editor** → **New query**.
2. Paste all of `supabase/migrations/0001_foundation.sql` → **Run**. It should end
   with "Success. No rows returned".
3. Check: **Table Editor** shows the 12 tables; **Storage** shows the private buckets
   `listing-videos` and `listing-thumbnails`.

4. Then run `supabase/migrations/0002_fill.sql` the same way (Fill tab: channel
   attribution, one link per channel, caption, raw clip types).
5. Then `supabase/migrations/0003_find_apply.sql` (Find & Apply: saved rooms,
   housemate invites and votes, report/block, moderation flags, notifications,
   computed Passport levels, the private buckets `profile-photos` and
   `applicant-intros`). Running it recomputes every Passport level with the new
   Level 1 rule (phone + photo + bio + move-in + budget + 6 lifestyle answers), so
   existing phone-only Passports drop to Level 0 until they're filled in.
6. Then `supabase/migrations/0004_listings_owner_select.sql` (a host can read back
   the draft listing they just created; without it, Fill shows "not_allowed").
7. Then `supabase/migrations/0005_passport_stay_length.sql` (Passport "Length of
   stay", the same choices as the host's lease term).
8. Then `supabase/migrations/0006_listing_square_feet.sql` (room size on listings).

Later schema changes go in a new numbered file (`0002_...sql`); never edit one
that has already been run.

## 3. Env vars (`.env.local`, server only)
Dashboard → **Project Settings** → **Data API** (URL) and **API Keys**:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
# optional: turn hidden 1.0 features back on, e.g. scout,ask_fenn
# demo_listings = 1.0 mock rooms after the real ones in Find; id_check = Passport Level 2 (demo)
FENLY_FLAGS=
# Email (Resend). Without both, notifications are saved in the notifications table and marked "skipped".
RESEND_API_KEY=re_...
FENLY_EMAIL_FROM=Fenly <hello@yourdomain.com>
# Review queue access (comma list of sign-in emails)
FENLY_ADMIN_EMAILS=you@example.com
# Daily move-out reminders: Vercel Cron sends it as a Bearer token. 16+ random characters.
CRON_SECRET=
```

- No `VITE_` prefix on any of them. The browser gets the URL and publishable key
  from `GET /api/config`; the secret key never leaves the server, and `/api/config`
  refuses to send a key that looks secret.
- Restart `npm run dev` after editing `.env.local`.
- Vercel: add the same names under Project → Settings → Environment Variables.

## 4. Sign-in providers (Authentication → Sign In / Providers)
- **Email**: on by default. Magic links work out of the box (Supabase's built-in
  mail is rate-limited to a few emails per hour; add custom SMTP before launch).
- **Google**: create an OAuth client in Google Cloud Console (Web application).
  Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
  Paste the client ID and secret into the Google provider in Supabase.
- **Phone**: needs an SMS provider (Twilio, MessageBird, Vonage or Textlocal) with
  its own account and per-text cost. Until it's set, the phone option shows
  "Phone sign-in isn't set up yet".

## 5. Redirect URLs (Authentication → URL Configuration)
- **Site URL**: your production URL (or `http://localhost:3000` for now).
- **Redirect URLs**, add each place you open the app:
  - `http://localhost:3000/**`
  - `http://<your-PC-LAN-IP>:3000/**` (for testing on your phone, see below)
  - `https://<your-vercel-domain>/**`

## 6. Test on your phone (same Wi-Fi)
1. Find your PC's LAN IP: PowerShell → `ipconfig` → "IPv4 Address" (e.g. 192.168.1.23).
2. Add `http://<that-IP>:3000/**` to Redirect URLs (step 5).
3. Allow port 3000 through Windows Firewall once (PowerShell as admin):
   `New-NetFirewallRule -DisplayName "Fenly dev 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private`
   (your Wi-Fi network must be set to Private.)
4. `npm run dev` on the PC, then open `http://<that-IP>:3000` on the phone.
5. Note: the phone's camera (guided shots) needs HTTPS outside localhost. For camera
   tests use the Vercel preview URL, or a tunnel such as `cloudflared tunnel --url http://localhost:3000`
   (add the tunnel URL to Redirect URLs too).

## 7. Storage size limit
Finished tours are about 14 MB for 17 s (about 25 MB for 30 s). Free Supabase
projects allow up to 50 MB per file, which fits; if an upload fails with
"larger than this project allows", raise **Storage → Settings → Upload file size
limit** (the bucket itself allows 100 MB).

## 8. Email, reminders and the review queue
- **Resend:** create an API key and verify your sending domain (resend.com →
  Domains), then set `RESEND_API_KEY` and `FENLY_EMAIL_FROM`. Every email is also a
  row in `notifications` (`email_status`: sent / skipped / failed), so you can see
  what would have gone out: `select kind, email_status, created_at from notifications order by created_at desc;`
- **Move-out reminders** (14, 7 and 3 days before move-out, rooms not yet filled):
  `vercel.json` runs `GET /api/cron/daily` every day at 16:00 UTC. Set `CRON_SECRET`
  in Vercel; Vercel sends it automatically. Locally:
  `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily`.
- **Review queue:** accounts listed in `FENLY_ADMIN_EMAILS` see Passport → Review
  queue: AI and rule flags on listings and messages, and user reports. "Hide"
  removes a listing from Find (its link still opens) or hides a message.
- **ID check (demo):** with `id_check` on, a host can ask a shortlisted applicant
  for an ID check. It's a Gemini look at a photo of the document, recorded as
  provider `demo`, not a vendor verification; hosts see "ID (demo check)". The
  photo is never stored. Swap in Stripe Identity or Persona in `server/idCheck.ts`
  before relying on it.

## 9. Analytics
Every `track()` call lands in the `events` table. Weekly counts:
`select * from weekly_event_counts order by week desc, events desc;` (SQL Editor).
