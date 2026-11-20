-- Fenly 2.0 fix: a host can read back the listing they just created.
-- Run after 0003_find_apply.sql in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- Why: POST /api/listings inserts a draft and reads it back (insert ... returning).
-- The select policy only allowed drafts through public.is_listing_member(id), which
-- looks the listing up in its own table. Inside that same statement the new row
-- isn't visible to the lookup yet, so Postgres refused the read with 42501 and the
-- app showed "not_allowed". Checking owner_id on the row itself avoids the lookup.

drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select to anon, authenticated
  using (status in ('published', 'filled') or owner_id = (select auth.uid()) or public.is_listing_member(id));

notify pgrst, 'reload schema';
