-- Fenly 2.0 Find & Apply: saved rooms, housemate invites and votes, report/block,
-- moderation flags, email notifications, Passport levels, profile photos and intro videos.
-- Run after 0002_fill.sql in Supabase Dashboard > SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Email notifications on/off (each email links to the setting).
alter table public.users add column if not exists notify_email boolean not null default true;
grant update (notify_email) on public.users to authenticated;

-- Set from the review queue: hidden listings leave the Find feed (their share link still works);
-- hidden messages are no longer shown.
alter table public.listings add column if not exists hidden_at timestamptz;
alter table public.messages add column if not exists hidden_at timestamptz;
-- Why a message was flagged (shown as a scam warning to the recipient).
alter table public.messages add column if not exists flag_reason text check (char_length(flag_reason) <= 200);

alter table public.applications add column if not exists decline_reason text
  check (decline_reason in ('host', 'room_filled'));
alter table public.applications add column if not exists id_check_requested_at timestamptz;

create index if not exists listings_find_idx on public.listings (status, neighborhood, published_at desc)
  where hidden_at is null;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.saved_listings (
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Only a hash of the token is stored; the link holds the token itself.
create table if not exists public.house_invites (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_by    uuid references public.users (id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists house_invites_listing_idx on public.house_invites (listing_id);

create table if not exists public.applicant_votes (
  application_id uuid not null references public.applications (id) on delete cascade,
  voter_id       uuid not null default auth.uid() references public.users (id) on delete cascade,
  vote           smallint not null check (vote in (-1, 1)),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (application_id, voter_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'user', 'message')),
  target_id   uuid not null,
  reason      text not null check (reason in ('scam', 'fair_housing', 'harassment', 'fake_listing', 'inappropriate', 'other')),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'reviewed')),
  created_at  timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

-- Written and read only by the server (AI checks, heuristics, reports); you review them in the app.
create table if not exists public.moderation_flags (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('listing', 'user', 'message')),
  target_id   uuid not null,
  source      text not null check (source in ('ai', 'heuristic', 'report')),
  category    text not null check (category in ('scam', 'fair_housing', 'off_platform', 'harassment', 'other')),
  severity    text not null check (severity in ('low', 'medium', 'high')),
  reason      text check (char_length(reason) <= 500),
  status      text not null default 'open' check (status in ('open', 'cleared', 'actioned')),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists moderation_flags_open_idx on public.moderation_flags (status, created_at desc);
create index if not exists moderation_flags_target_idx on public.moderation_flags (target_type, target_id);

-- In-app notifications and the email outbox in one table. The server writes them.
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  kind         text not null check (kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  listing_id   uuid references public.listings (id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  email_status text not null default 'queued' check (email_status in ('queued', 'sent', 'skipped', 'failed')),
  email_error  text,
  dedupe_key   text unique,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.listing_of_application(app uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select a.listing_id from public.applications a where a.id = app;
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  );
$$;

drop trigger if exists applicant_votes_updated_at on public.applicant_votes;
create trigger applicant_votes_updated_at before update on public.applicant_votes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Passport level, computed (users can't set it)
--   1 = phone verified + photo + bio + move-in window + budget + all 6 lifestyle answers
--   2 = level 1 + government ID verified
--   3 = level 2 + rent history verified
-- Mirrors src/find/passportLevel.ts.
-- ---------------------------------------------------------------------------

create or replace function public.passport_level_for(p public.passports, photo text, about text)
returns smallint language sql immutable set search_path = ''
as $$
  select case
    when not (
      p.phone_verified
      and nullif(btrim(coalesce(photo, '')), '') is not null
      and nullif(btrim(coalesce(about, '')), '') is not null
      and p.move_in_from is not null
      and p.budget_max_cents is not null
      and (select count(*) from unnest(array['sleep', 'cleanliness', 'guests', 'pets', 'smoking', 'wfh']) k
           where nullif(btrim(coalesce(p.lifestyle ->> k, '')), '') is not null) = 6
    ) then 0
    when not p.id_verified then 1
    when not p.rent_history_verified then 2
    else 3
  end::smallint;
$$;

create or replace function public.passports_set_level()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  u record;
begin
  select photo_url, bio into u from public.users where id = new.user_id;
  new.level := public.passport_level_for(new, u.photo_url, u.bio);
  return new;
end;
$$;

drop trigger if exists passports_level on public.passports;
create trigger passports_level before insert or update on public.passports
  for each row execute function public.passports_set_level();

-- A new photo or bio re-computes the level.
create or replace function public.users_touch_passport()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.photo_url is distinct from old.photo_url or new.bio is distinct from old.bio then
    update public.passports set updated_at = now() where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists users_touch_passport on public.users;
create trigger users_touch_passport after update of photo_url, bio on public.users
  for each row execute function public.users_touch_passport();

-- Old lifestyle keys (schedule, tidiness) map to the new ones; "social" is dropped.
update public.passports
   set lifestyle = (lifestyle - 'schedule' - 'tidiness' - 'social')
     || case when lifestyle ? 'schedule' and not lifestyle ? 'sleep'
             then jsonb_build_object('sleep', lifestyle -> 'schedule') else '{}'::jsonb end
     || case when lifestyle ? 'tidiness' and not lifestyle ? 'cleanliness'
             then jsonb_build_object('cleanliness', lifestyle -> 'tidiness') else '{}'::jsonb end
 where lifestyle ?| array['schedule', 'tidiness', 'social'];

-- Recompute every level once with the new rule.
update public.passports set updated_at = updated_at;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.saved_listings   enable row level security;
alter table public.house_invites    enable row level security;
alter table public.applicant_votes  enable row level security;
alter table public.blocks           enable row level security;
alter table public.reports          enable row level security;
alter table public.moderation_flags enable row level security;
alter table public.notifications    enable row level security;

revoke all on public.moderation_flags from anon, authenticated;
revoke all on public.saved_listings, public.house_invites, public.applicant_votes,
              public.blocks, public.reports, public.notifications from anon;
revoke update on public.house_invites, public.reports, public.blocks, public.saved_listings from authenticated;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- saved rooms: your own, published rooms only
drop policy if exists saved_listings_select on public.saved_listings;
create policy saved_listings_select on public.saved_listings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists saved_listings_insert on public.saved_listings;
create policy saved_listings_insert on public.saved_listings for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_listing_public(listing_id));
drop policy if exists saved_listings_delete on public.saved_listings;
create policy saved_listings_delete on public.saved_listings for delete to authenticated
  using (user_id = (select auth.uid()));

-- housemate invites: the host makes and sees them; the server redeems them
drop policy if exists house_invites_select on public.house_invites;
create policy house_invites_select on public.house_invites for select to authenticated
  using (public.is_listing_owner(listing_id));
drop policy if exists house_invites_insert on public.house_invites;
create policy house_invites_insert on public.house_invites for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_listing_owner(listing_id) and used_by is null);
drop policy if exists house_invites_delete on public.house_invites;
create policy house_invites_delete on public.house_invites for delete to authenticated
  using (public.is_listing_owner(listing_id));

-- votes: the listing's host and housemates see them; each member writes their own; applicants never see them
drop policy if exists applicant_votes_select on public.applicant_votes;
create policy applicant_votes_select on public.applicant_votes for select to authenticated
  using (public.is_listing_member(public.listing_of_application(application_id)));
drop policy if exists applicant_votes_insert on public.applicant_votes;
create policy applicant_votes_insert on public.applicant_votes for insert to authenticated
  with check (voter_id = (select auth.uid()) and public.is_listing_member(public.listing_of_application(application_id)));
drop policy if exists applicant_votes_update on public.applicant_votes;
create policy applicant_votes_update on public.applicant_votes for update to authenticated
  using (voter_id = (select auth.uid()))
  with check (voter_id = (select auth.uid()) and public.is_listing_member(public.listing_of_application(application_id)));
drop policy if exists applicant_votes_delete on public.applicant_votes;
create policy applicant_votes_delete on public.applicant_votes for delete to authenticated
  using (voter_id = (select auth.uid()));

-- blocks: your own list
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- reports: file your own and see that you filed them
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

-- notifications: read your own, mark them read
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- moderation_flags: RLS on, no policies. Server only.

-- Blocking works both ways: no applying to, or messaging, someone on either side of a block.
drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'submitted'
    and public.is_listing_public(listing_id)
    and not public.is_listing_member(listing_id)
    and not exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_blocked_between((select auth.uid()), l.owner_id)
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and not public.is_blocked_between(sender_id, recipient_id)
    and exists (
      select 1 from public.applications a
      where a.id = messages.application_id
        and (
          (a.applicant_id = (select auth.uid()) and public.is_listing_member_of(a.listing_id, messages.recipient_id))
          or (public.is_listing_member(a.listing_id) and messages.recipient_id = a.applicant_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: profile photos and applicant intro videos (private; the server signs
-- read links for the listings an applicant applied to). Paths are "<user_id>/...".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('applicant-intros', 'applicant-intros', false, 20971520, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists own_user_files_read on storage.objects;
create policy own_user_files_read on storage.objects for select to authenticated
  using (bucket_id in ('profile-photos', 'applicant-intros') and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists own_user_files_insert on storage.objects;
create policy own_user_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('profile-photos', 'applicant-intros') and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists own_user_files_update on storage.objects;
create policy own_user_files_update on storage.objects for update to authenticated
  using (bucket_id in ('profile-photos', 'applicant-intros') and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists own_user_files_delete on storage.objects;
create policy own_user_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('profile-photos', 'applicant-intros') and split_part(name, '/', 1) = (select auth.uid())::text);
