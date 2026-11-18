-- Fenly 2.0 foundation: tables, row-level security, storage.
-- Run once in Supabase Dashboard > SQL Editor (new query > paste > Run).
-- Safe to re-run on an empty project; it does not drop anything.
--
-- Access model
--   anon           signed-out visitors: may read published listings and their public media
--   authenticated  signed-in users: rows they own or share through a listing
--   service role   the server (SUPABASE_SECRET_KEY): bypasses RLS; the only writer of
--                  events, link_visits, verifications and Passport badges

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  first_name   text check (char_length(first_name) <= 40),
  photo_url    text,
  bio          text check (char_length(bio) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.passports (
  user_id               uuid primary key references public.users (id) on delete cascade,
  level                 smallint not null default 0 check (level between 0 and 3),
  move_in_from          date,
  move_in_to            date,
  budget_min_cents      integer check (budget_min_cents >= 0),
  budget_max_cents      integer check (budget_max_cents >= 0),
  lifestyle             jsonb not null default '{}'::jsonb,
  phone_verified        boolean not null default false,
  id_verified           boolean not null default false,
  rent_history_verified boolean not null default false,
  updated_at            timestamptz not null default now(),
  check (move_in_to is null or move_in_from is null or move_in_to >= move_in_from),
  check (budget_max_cents is null or budget_min_cents is null or budget_max_cents >= budget_min_cents)
);

create table if not exists public.verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  kind         text not null check (kind in ('phone', 'email', 'government_id', 'rent_history')),
  status       text not null default 'pending' check (status in ('pending', 'verified', 'failed', 'expired')),
  provider     text,
  provider_ref text,
  verified_at  timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists verifications_user_idx on public.verifications (user_id);

create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.users (id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft', 'published', 'filled', 'archived')),
  title            text check (char_length(title) <= 120),
  description      text check (char_length(description) <= 4000),
  neighborhood     text,
  city             text not null default 'San Francisco',
  rent_cents       integer check (rent_cents >= 0),
  deposit_cents    integer check (deposit_cents >= 0),
  available_from   date,
  move_out_date    date,
  lease_term       text,
  lease_permission text check (lease_permission in ('can_replace', 'leaseholder', 'not_sure')),
  beds             smallint check (beds >= 0),
  baths            numeric(3, 1) check (baths >= 0),
  amenities        text[] not null default '{}',
  house_rules      text check (char_length(house_rules) <= 2000),
  approx_lat       numeric(8, 5),
  approx_lng       numeric(8, 5),
  -- When the host approved the (AI-assisted) listing text. Required to publish.
  copy_approved_at timestamptz,
  viral_edit       jsonb,
  published_at     timestamptz,
  filled_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint listings_publish_requirements check (
    status not in ('published', 'filled')
    or (lease_permission in ('can_replace', 'leaseholder') and copy_approved_at is not null)
  )
);
create index if not exists listings_owner_idx on public.listings (owner_id);
create index if not exists listings_public_idx on public.listings (status, published_at desc);

create table if not exists public.house_members (
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  role       text not null default 'housemate' check (role in ('host', 'housemate')),
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);
create index if not exists house_members_user_idx on public.house_members (user_id);

create table if not exists public.listing_media (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  kind        text not null check (kind in ('video_full', 'video_teaser', 'thumbnail', 'raw_clip')),
  bucket      text not null check (bucket in ('listing-videos', 'listing-thumbnails')),
  path        text not null,
  duration_ms integer check (duration_ms >= 0),
  width       integer check (width > 0),
  height      integer check (height > 0),
  bytes       bigint check (bytes >= 0),
  created_at  timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists listing_media_listing_idx on public.listing_media (listing_id);

create table if not exists public.listing_links (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  channel    text not null check (channel in ('facebook', 'reddit', 'tiktok', 'instagram', 'group_chat', 'direct', 'other')),
  code       text not null unique check (code ~ '^[A-Za-z0-9_-]{4,32}$'),
  created_at timestamptz not null default now()
);
create index if not exists listing_links_listing_idx on public.listing_links (listing_id);

create table if not exists public.link_visits (
  id            bigint generated always as identity primary key,
  link_id       uuid not null references public.listing_links (id) on delete cascade,
  anon_id       text,
  user_id       uuid references public.users (id) on delete set null,
  referrer_host text,
  created_at    timestamptz not null default now()
);
create index if not exists link_visits_link_idx on public.link_visits (link_id, created_at);

create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.listings (id) on delete cascade,
  applicant_id     uuid not null references public.users (id) on delete cascade,
  status           text not null default 'submitted'
                   check (status in ('submitted', 'shortlisted', 'declined', 'chosen', 'withdrawn')),
  note             text check (char_length(note) <= 1000),
  intro_video_path text,
  move_in_date     date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (listing_id, applicant_id)
);
create index if not exists applications_applicant_idx on public.applications (applicant_id);

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sender_id      uuid not null references public.users (id) on delete cascade,
  recipient_id   uuid not null references public.users (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 4000),
  read_at        timestamptz,
  flagged        boolean not null default false,
  created_at     timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists messages_thread_idx on public.messages (application_id, created_at);
create index if not exists messages_recipient_idx on public.messages (recipient_id, read_at);

-- "references" is a reserved word in SQL: always quote it in SQL. supabase-js: .from('references').
create table if not exists public."references" (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.users (id) on delete cascade,
  subject_id       uuid not null references public.users (id) on delete cascade,
  listing_id       uuid references public.listings (id) on delete set null,
  would_live_again boolean,
  pays_on_time     boolean,
  clean            boolean,
  quiet            boolean,
  comment          text check (char_length(comment) <= 500),
  created_at       timestamptz not null default now(),
  check (author_id <> subject_id),
  unique nulls not distinct (author_id, subject_id, listing_id)
);
create index if not exists references_subject_idx on public."references" (subject_id);

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  name       text not null check (name ~ '^[a-z][a-z0-9_]{1,63}$'),
  user_id    uuid,
  anon_id    text,
  listing_id uuid,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time_idx on public.events (name, created_at);

-- updated_at triggers
drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
drop trigger if exists passports_updated_at on public.passports;
create trigger passports_updated_at before update on public.passports
  for each row execute function public.set_updated_at();
drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();
drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Policy helpers (security definer so policies don't recurse into each other)
-- ---------------------------------------------------------------------------

create or replace function public.is_listing_owner(listing uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.listings l where l.id = listing and l.owner_id = (select auth.uid()));
$$;

create or replace function public.is_listing_member_of(listing uuid, uid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select uid is not null and (
    exists (select 1 from public.listings l where l.id = listing and l.owner_id = uid)
    or exists (select 1 from public.house_members m where m.listing_id = listing and m.user_id = uid)
  );
$$;

create or replace function public.is_listing_member(listing uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_listing_member_of(listing, (select auth.uid()));
$$;

create or replace function public.is_listing_public(listing uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.listings l where l.id = listing and l.status in ('published', 'filled'));
$$;

-- True when the signed-in user and `other` are connected through a listing:
-- members of the same listing, or applicant <-> member of the listing applied to.
create or replace function public.shares_listing_with(other uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  my_listings as (
    select l.id from public.listings l, me where l.owner_id = me.id
    union
    select m.listing_id from public.house_members m, me where m.user_id = me.id
  ),
  my_applied as (
    select a.listing_id from public.applications a, me where a.applicant_id = me.id
  )
  select
    exists (select 1 from my_listings ml where public.is_listing_member_of(ml.id, other))
    or exists (select 1 from public.applications a join my_listings ml on ml.id = a.listing_id
               where a.applicant_id = other)
    or exists (select 1 from my_applied ma where public.is_listing_member_of(ma.listing_id, other));
$$;

-- Storage paths are "<listing_id>/<file>". Returns null for anything that isn't a uuid.
create or replace function public.listing_id_from_path(object_name text)
returns uuid language sql immutable set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
  end;
$$;

-- ---------------------------------------------------------------------------
-- New users get a profile and a Passport; a confirmed phone sets the badge
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  full_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  insert into public.users (id, display_name, first_name, photo_url)
  values (
    new.id,
    left(full_name, 80),
    left(split_part(coalesce(full_name, ''), ' ', 1), 40),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.passports (user_id, phone_verified, level)
  values (new.id, new.phone_confirmed_at is not null, case when new.phone_confirmed_at is not null then 1 else 0 end)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_phone_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.phone_confirmed_at is not null and old.phone_confirmed_at is null then
    update public.passports
       set phone_verified = true, level = greatest(level, 1)
     where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_phone_confirmed on auth.users;
create trigger on_auth_phone_confirmed after update of phone_confirmed_at on auth.users
  for each row execute function public.handle_phone_confirmed();

-- Applicants may only withdraw or edit their note; owners may only change status.
create or replace function public.applications_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return new; -- server (service role)
  end if;
  if new.listing_id <> old.listing_id or new.applicant_id <> old.applicant_id
     or new.created_at <> old.created_at then
    raise exception 'applications: listing, applicant and created_at cannot change';
  end if;
  if public.is_listing_owner(old.listing_id) then
    if new.note is distinct from old.note
       or new.intro_video_path is distinct from old.intro_video_path
       or new.move_in_date is distinct from old.move_in_date
       or new.status = 'withdrawn' then
      raise exception 'applications: the host may only change status';
    end if;
  elsif old.applicant_id = uid then
    if new.status <> old.status and new.status <> 'withdrawn' then
      raise exception 'applications: applicants may only withdraw';
    end if;
  else
    raise exception 'applications: not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_guard on public.applications;
create trigger applications_guard before update on public.applications
  for each row execute function public.applications_guard();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.users          enable row level security;
alter table public.passports      enable row level security;
alter table public.verifications  enable row level security;
alter table public.listings       enable row level security;
alter table public.house_members  enable row level security;
alter table public.listing_media  enable row level security;
alter table public.listing_links  enable row level security;
alter table public.link_visits    enable row level security;
alter table public.applications   enable row level security;
alter table public.messages       enable row level security;
alter table public."references"   enable row level security;
alter table public.events         enable row level security;

-- Server-only tables: no client access at all.
revoke all on public.events, public.link_visits, public.verifications from anon, authenticated;
grant select on public.link_visits, public.verifications to authenticated;

-- Column-level write limits (RLS picks the rows, grants pick the columns).
revoke insert, update, delete on public.users from anon, authenticated;
grant update (display_name, first_name, photo_url, bio) on public.users to authenticated;

revoke insert, update, delete on public.passports from anon, authenticated;
grant update (move_in_from, move_in_to, budget_min_cents, budget_max_cents, lifestyle)
  on public.passports to authenticated;

revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;

revoke insert, update, delete on public."references" from anon;
revoke update on public."references" from authenticated;

-- users
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or public.shares_listing_with(id));
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- passports
drop policy if exists passports_select on public.passports;
create policy passports_select on public.passports for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.applications a
               where a.applicant_id = passports.user_id and public.is_listing_member(a.listing_id))
  );
drop policy if exists passports_update_self on public.passports;
create policy passports_update_self on public.passports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- verifications (read own status only; the server writes)
drop policy if exists verifications_select_self on public.verifications;
create policy verifications_select_self on public.verifications for select to authenticated
  using (user_id = (select auth.uid()));

-- listings
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select to anon, authenticated
  using (status in ('published', 'filled') or public.is_listing_member(id));
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists listings_delete_draft on public.listings;
create policy listings_delete_draft on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- house_members
drop policy if exists house_members_select on public.house_members;
create policy house_members_select on public.house_members for select to authenticated
  using (public.is_listing_member(listing_id));
drop policy if exists house_members_insert on public.house_members;
create policy house_members_insert on public.house_members for insert to authenticated
  with check (public.is_listing_owner(listing_id));
drop policy if exists house_members_delete on public.house_members;
create policy house_members_delete on public.house_members for delete to authenticated
  using (public.is_listing_owner(listing_id) or user_id = (select auth.uid()));

-- listing_media
drop policy if exists listing_media_select on public.listing_media;
create policy listing_media_select on public.listing_media for select to anon, authenticated
  using ((kind <> 'raw_clip' and public.is_listing_public(listing_id)) or public.is_listing_member(listing_id));
drop policy if exists listing_media_write on public.listing_media;
create policy listing_media_write on public.listing_media for all to authenticated
  using (public.is_listing_owner(listing_id)) with check (public.is_listing_owner(listing_id));

-- listing_links (public lookups of a code go through the server)
drop policy if exists listing_links_owner on public.listing_links;
create policy listing_links_owner on public.listing_links for all to authenticated
  using (public.is_listing_owner(listing_id)) with check (public.is_listing_owner(listing_id));

-- link_visits (the server writes; the listing owner reads)
drop policy if exists link_visits_owner_select on public.link_visits;
create policy link_visits_owner_select on public.link_visits for select to authenticated
  using (exists (select 1 from public.listing_links k
                 where k.id = link_visits.link_id and public.is_listing_owner(k.listing_id)));

-- applications
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications for select to authenticated
  using (applicant_id = (select auth.uid()) or public.is_listing_member(listing_id));
drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'submitted'
    and public.is_listing_public(listing_id)
    and not public.is_listing_member(listing_id)
  );
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated
  using (applicant_id = (select auth.uid()) or public.is_listing_owner(listing_id))
  with check (applicant_id = (select auth.uid()) or public.is_listing_owner(listing_id));

-- messages (one thread per application: the applicant and the listing's members)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
      where a.id = messages.application_id
        and (
          (a.applicant_id = (select auth.uid()) and public.is_listing_member_of(a.listing_id, messages.recipient_id))
          or (public.is_listing_member(a.listing_id) and messages.recipient_id = a.applicant_id)
        )
    )
  );
drop policy if exists messages_mark_read on public.messages;
create policy messages_mark_read on public.messages for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- references
drop policy if exists references_select on public."references";
create policy references_select on public."references" for select to authenticated
  using (author_id = (select auth.uid()) or subject_id = (select auth.uid()));
drop policy if exists references_insert on public."references";
create policy references_insert on public."references" for insert to authenticated
  with check (author_id = (select auth.uid()));
drop policy if exists references_delete on public."references";
create policy references_delete on public."references" for delete to authenticated
  using (author_id = (select auth.uid()));

-- events: RLS on, no policies. Only the server (service role) reads or writes.

-- ---------------------------------------------------------------------------
-- Storage: private buckets, public read only for published listings
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-videos', 'listing-videos', false, 104857600, array['video/mp4']),
  ('listing-thumbnails', 'listing-thumbnails', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Raw clips live under "<listing_id>/raw/..." and are never public.
drop policy if exists listing_files_read on storage.objects;
create policy listing_files_read on storage.objects for select to anon, authenticated
  using (
    bucket_id in ('listing-videos', 'listing-thumbnails')
    and (
      (public.is_listing_public(public.listing_id_from_path(name)) and split_part(name, '/', 2) <> 'raw')
      or public.is_listing_member(public.listing_id_from_path(name))
    )
  );
drop policy if exists listing_files_insert on storage.objects;
create policy listing_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('listing-videos', 'listing-thumbnails')
    and public.is_listing_owner(public.listing_id_from_path(name))
  );
drop policy if exists listing_files_update on storage.objects;
create policy listing_files_update on storage.objects for update to authenticated
  using (
    bucket_id in ('listing-videos', 'listing-thumbnails')
    and public.is_listing_owner(public.listing_id_from_path(name))
  );
drop policy if exists listing_files_delete on storage.objects;
create policy listing_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('listing-videos', 'listing-thumbnails')
    and public.is_listing_owner(public.listing_id_from_path(name))
  );

-- ---------------------------------------------------------------------------
-- Weekly metrics (server / dashboard only)
-- ---------------------------------------------------------------------------
create or replace view public.weekly_event_counts
with (security_invoker = true)
as
  select date_trunc('week', created_at) as week, name, count(*) as events,
         count(distinct coalesce(user_id::text, anon_id)) as people
  from public.events
  group by 1, 2;
revoke all on public.weekly_event_counts from anon, authenticated;
