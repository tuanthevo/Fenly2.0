-- Fenly 2.0: length of stay on the Passport (replaces "Move in by" in the UI).
-- Run after 0004_listings_owner_select.sql in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- The options match the host's lease term in Fill (src/fill/leaseTerms.ts).
-- move_in_to stays in the table (unused by the app now) so nothing is dropped.

alter table public.passports
  add column if not exists stay_length text;

alter table public.passports
  drop constraint if exists passports_stay_length_check;
alter table public.passports
  add constraint passports_stay_length_check
  check (stay_length is null or stay_length in ('Month-to-month', '3 months', '6 months', '9 months', '12+ months'));

grant update (stay_length) on public.passports to authenticated;

notify pgrst, 'reload schema';
