# Fenn 2.0 pre-launch checklist

Work top to bottom. Detailed Supabase steps are in [supabase.md](supabase.md).

## 1. Supabase (production project)
- [ ] **Schema:** SQL Editor → run `supabase/migrations/0001_foundation.sql`, then `0002_fill.sql`, then `0003_find_apply.sql`. Table Editor shows every table with the RLS badge on.
- [ ] **Storage:** buckets `listing-videos`, `listing-thumbnails`, `profile-photos`, `applicant-intros` exist and are private. Storage → Settings → upload file size limit **≥ 50 MB** (finished tours are 15-30 MB).
- [ ] **Auth → URL Configuration:**
  - Site URL = `https://<your-domain>`.
  - Redirect URLs: `https://<your-domain>/**`, `https://*-<your-team>.vercel.app/**` (previews), and `http://localhost:3000/**` (dev).
- [ ] **Auth → Providers:**
  - Email (magic link) is on.
  - Google: OAuth client in Google Cloud with the Supabase callback URL.
  - Phone: an SMS provider (Twilio/MessageBird/Vonage) with a funded account.
- [ ] **Auth → SMTP:** a custom SMTP sender (for example Resend SMTP) so sign-in emails come from your domain. Supabase's built-in sender only allows a few emails per hour.
- [ ] **Auth → Rate limits:** set email and SMS limits that fit launch traffic (they protect your SMS bill).
- [ ] **Backups:** a paid plan with daily backups; turn on Point-in-Time Recovery if you can.
- [ ] **Keys:** copy the project URL, the publishable key and the secret key for step 2. The secret key never goes in the browser or the repo.

## 2. Vercel environment variables (Production + Preview)
| Name | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio key | server only |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | served to the browser through `/api/config` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | server only, never `VITE_` |
| `APP_URL` | `https://<your-domain>` | share links and emails use it |
| `FENLY_FLAGS` | empty, or e.g. `id_check` | `demo_listings` and `photo_tour` only for demos |
| `RESEND_API_KEY` | `re_…` | |
| `FENLY_EMAIL_FROM` | `Fenn <hello@<your-domain>>` | the domain must be verified in Resend |
| `FENLY_ADMIN_EMAILS` | your sign-in email(s) | opens the Review queue and Metrics |
| `CRON_SECRET` | 32 random characters | Vercel Cron sends it to `/api/cron/daily` |
| `VITE_GOOGLE_MAPS_API_KEY` | browser key | restrict it by HTTP referrer to your domain |

Redeploy after changing variables.

## 3. Domain and email
- [ ] **Domain:** Vercel → Project → Domains, then add the DNS records it shows. HTTPS is automatic, and service workers and the camera need it.
- [ ] **APP_URL:** set it to that domain (step 2), and use the same domain as the Supabase Site URL (step 1).
- [ ] **Resend:** add the domain and publish its SPF, DKIM (and ideally DMARC) records. Send yourself a test and check it doesn't land in spam.
- [ ] **Link previews:** open `https://<your-domain>/r/<code>` in the Facebook Sharing Debugger and in an iMessage/WhatsApp chat. The preview should show the cover, price and area.

## 4. Legal and trust (plan Part 7)
- [ ] **Policies:** replace the placeholders `public/privacy.html` and `public/terms.html` with lawyer-reviewed versions. They are linked from the sign-in sheet and Passport.
- [ ] **Company:** entity set up; the contact and privacy email used in the policies works.
- [ ] **Fair housing:** a lawyer reviews the lifestyle questions (`src/find/lifestyle.ts`) and the listing copy rules.
- [ ] **ID check:** keep `id_check` off, or replace the demo check in `server/idCheck.ts` with a vendor (Stripe Identity, Persona) before showing ID badges publicly.
- [ ] **Review cadence:** decide who checks the Review queue and how often (target: within 24 h).

## 5. Final smoke test on two phones (production URL)
1. Install from the browser (Android: the prompt after publishing or applying; iPhone: Share → Add to Home Screen). The icon is the Fenn fox.
2. Publish a room, share the Facebook link, open it signed out, and apply from a second account.
3. The host gets the email, shortlists and messages, then chooses. The other applicants see "This room is taken".
4. Passport → Metrics (admin) shows the counts. Turn on airplane mode and reopen the app: the shell or the offline page shows.
