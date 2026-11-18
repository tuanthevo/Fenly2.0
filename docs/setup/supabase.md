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

Later schema changes go in a new numbered file (`0002_...sql`); never edit one
that has already been run.

## 3. Env vars (`.env.local`, server only)
Dashboard → **Project Settings** → **Data API** (URL) and **API Keys**:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
# optional: turn hidden 1.0 features back on, e.g. scout,ask_fenn
FENLY_FLAGS=
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

## 8. Analytics
Every `track()` call lands in the `events` table. Weekly counts:
`select * from weekly_event_counts order by week desc, events desc;` (SQL Editor).
