-- Fenly 2.0 Fill tab: channel attribution, share caption, raw clip types.
-- Run after 0001_foundation.sql in Supabase Dashboard > SQL Editor. Safe to re-run.

-- Which tracked link (channel) an application came through.
alter table public.applications
  add column if not exists source_link_id uuid references public.listing_links (id) on delete set null;
create index if not exists applications_source_link_idx on public.applications (source_link_id);

-- One tracked link per channel per listing.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listing_links_listing_channel_key') then
    alter table public.listing_links
      add constraint listing_links_listing_channel_key unique (listing_id, channel);
  end if;
end;
$$;

-- The editor's caption, reused in share posts.
alter table public.listings
  add column if not exists caption text check (char_length(caption) <= 2200);

-- Raw phone clips (kept under "<listing_id>/raw/" for drafts and re-editing) are
-- webm (Android/Chrome) or mov (iPhone); finished tours are mp4.
update storage.buckets
   set allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
 where id = 'listing-videos';

-- An applicant reads which link they came through only on their own application;
-- hosts see it through the status route (server). No policy changes needed:
-- applications' existing select policy already covers both sides.
