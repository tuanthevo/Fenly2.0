-- Fenly 2.0: room size on listings (Fill details step, shown on Find).
-- Run after 0005_passport_stay_length.sql in Supabase Dashboard > SQL Editor. Safe to re-run.

alter table public.listings
  add column if not exists square_feet integer;

alter table public.listings
  drop constraint if exists listings_square_feet_check;
alter table public.listings
  add constraint listings_square_feet_check
  check (square_feet is null or square_feet between 50 and 10000);

notify pgrst, 'reload schema';
