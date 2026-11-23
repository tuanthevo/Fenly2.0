-- Fenly 2.0: "New rooms that match" alerts on the Passport (daily digest).
-- Run after 0006_listing_square_feet.sql in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- The renter turns alerts on and picks a place + radius; the budget, move-in date and
-- length of stay already on the Passport do the rest (src/find/roomAlerts.ts). The daily
-- cron (GET /api/cron/daily) sends the digest and sets alerts_sent_at (server only).

alter table public.passports
  add column if not exists alert_rooms boolean not null default false,
  add column if not exists alert_place text,
  add column if not exists alert_lat double precision,
  add column if not exists alert_lng double precision,
  add column if not exists alert_miles smallint,
  add column if not exists alerts_sent_at timestamptz;

alter table public.passports drop constraint if exists passports_alert_place_check;
alter table public.passports
  add constraint passports_alert_place_check check (alert_place is null or char_length(alert_place) <= 60);

alter table public.passports drop constraint if exists passports_alert_miles_check;
alter table public.passports
  add constraint passports_alert_miles_check check (alert_miles is null or alert_miles in (1, 3, 5, 10, 25));

-- The launch area's box (src/geo/bayArea.ts BAY_AREA_BOUNDS); both set or both empty
alter table public.passports drop constraint if exists passports_alert_point_check;
alter table public.passports
  add constraint passports_alert_point_check check (
    (alert_lat is null and alert_lng is null)
    or (alert_lat between 36.85 and 38.3 and alert_lng between -122.65 and -121.3)
  );

-- Renters change their own alert settings; alerts_sent_at stays server-only
grant update (alert_rooms, alert_place, alert_lat, alert_lng, alert_miles) on public.passports to authenticated;

notify pgrst, 'reload schema';
g  hh