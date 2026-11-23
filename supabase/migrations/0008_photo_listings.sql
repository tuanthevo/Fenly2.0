-- Fenly 2.0: photo listings (Fill > "Take photos").
-- Run after 0007_room_alerts.sql in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- This migration only adds things: one column with a default, one table, one
-- bucket and their policies. Nothing existing is dropped or changed, so the
-- previous app version keeps working on the same database (it sees every
-- listing as a video listing, and a photo listing's tour is stored as an
-- ordinary video_full + thumbnail in listing_media).

-- Which kind of tour the host chose. Existing rows are video listings.
alter table public.listings
  add column if not exists media_type text not null default 'video' check (media_type in ('video', 'photos'));

-- The host's own photos, one row each. Deleting a listing (or its owner, which
-- deletes their listings) removes these rows; the files are removed by the
-- server (server/listingFiles.ts), since a cascade does not reach Storage.
create table if not exists public.listing_photos (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.listings (id) on delete cascade,
  slot             text not null check (slot in ('doorway', 'center', 'corner', 'storage', 'kitchen', 'bathroom', 'living', 'building', 'other')),
  position         smallint not null default 0 check (position >= 0),
  storage_path     text not null,
  width            integer check (width > 0),
  height           integer check (height > 0),
  caption          text check (char_length(caption) <= 80),
  caption_approved boolean not null default false,
  phash            text check (char_length(phash) <= 32),
  qc_flags         jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  unique (storage_path)
);
create index if not exists listing_photos_listing_idx on public.listing_photos (listing_id, position);

alter table public.listing_photos enable row level security;
revoke insert, update, delete on public.listing_photos from anon;

-- Anyone may read the photos of a published or filled listing; drafts are for the household.
drop policy if exists listing_photos_select on public.listing_photos;
create policy listing_photos_select on public.listing_photos for select to anon, authenticated
  using (public.is_listing_public(listing_id) or public.is_listing_member(listing_id));
drop policy if exists listing_photos_write on public.listing_photos;
create policy listing_photos_write on public.listing_photos for all to authenticated
  using (public.is_listing_owner(listing_id)) with check (public.is_listing_owner(listing_id));

-- Private bucket, same pattern as listing-videos: paths are "<listing_id>/<file>",
-- the owner writes, and viewers get signed URLs for published listings only.
-- Photos are re-encoded in the browser (no EXIF, at most 2400 px), so JPEG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists listing_photo_files_read on storage.objects;
create policy listing_photo_files_read on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'listing-photos'
    and (
      public.is_listing_public(public.listing_id_from_path(name))
      or public.is_listing_member(public.listing_id_from_path(name))
    )
  );
drop policy if exists listing_photo_files_insert on storage.objects;
create policy listing_photo_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and public.is_listing_owner(public.listing_id_from_path(name))
  );
drop policy if exists listing_photo_files_update on storage.objects;
create policy listing_photo_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and public.is_listing_owner(public.listing_id_from_path(name))
  );
drop policy if exists listing_photo_files_delete on storage.objects;
create policy listing_photo_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and public.is_listing_owner(public.listing_id_from_path(name))
  );

notify pgrst, 'reload schema';
