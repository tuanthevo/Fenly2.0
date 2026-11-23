/**
 * Guards on migration 0008 (photo listings). The unit tests cannot reach a
 * database, so this reads the SQL: it must only add things (the previous app
 * version keeps working on the same database), and the listing-photos bucket
 * and table must be locked down the same way as listing-videos.
 * scripts/check-photo-rls.ts tests the live policies against a real project.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve(import.meta.dirname, "..", "supabase", "migrations", "0008_photo_listings.sql");
const raw = fs.readFileSync(FILE, "utf8");
/** The SQL without comments, lower-cased, whitespace collapsed. */
const sql = raw.replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();

/** The body of `create policy <name> ...;` */
function policy(name: string): string {
  const match = new RegExp(`create policy ${name} on ([a-z_.]+) (.*?);`).exec(sql);
  assert.ok(match, `policy ${name} is missing`);
  return `${match[1]} ${match[2]}`;
}

test("0008 only adds: no drops, deletes or changes to existing tables, columns or policies", () => {
  for (const banned of ["drop table", "drop column", "alter column", "drop constraint", "drop type", "drop function", "delete from", "truncate", "rename "]) {
    assert.equal(sql.includes(banned), false, `"${banned}" is not allowed in an additive migration`);
  }
  // Re-running may replace its own policies, never the ones 0001-0007 created
  const dropped = [...sql.matchAll(/drop policy if exists ([a-z_]+)/g)].map((m) => m[1]);
  assert.ok(dropped.length > 0);
  for (const name of dropped) assert.match(name, /^listing_photos?_/, `${name} belongs to an earlier migration`);
  // The only existing table it alters is listings, and only to add the column
  const altered = [...sql.matchAll(/alter table ([a-z_.]+) (\w+ \w+)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual([...new Set(altered)].sort(), ["public.listing_photos enable row", "public.listings add column"]);
  assert.equal(/update storage\.buckets|update public\./.test(sql), false, "no updates to existing rows");
});

test("listings.media_type is video or photos, default video, so existing rows and the old app are video listings", () => {
  assert.match(sql, /add column if not exists media_type text not null default 'video' check \(media_type in \('video', 'photos'\)\)/);
});

test("listing_photos has the columns the app uses and is removed with its listing", () => {
  const table = /create table if not exists public\.listing_photos \((.*?)\);/.exec(sql)?.[1] ?? "";
  for (const column of ["id ", "listing_id ", "slot ", "position ", "storage_path ", "width ", "height ", "caption ", "caption_approved ", "phash ", "qc_flags jsonb", "created_at "]) {
    assert.ok(table.includes(column), `column ${column.trim()} is missing`);
  }
  assert.match(table, /listing_id uuid not null references public\.listings \(id\) on delete cascade/);
  for (const slot of ["doorway", "center", "corner", "storage", "kitchen", "bathroom", "living", "building", "other"]) {
    assert.ok(table.includes(`'${slot}'`), `slot ${slot}`);
  }
});

test("listing_photos has row-level security: owners write, drafts stay private", () => {
  assert.ok(sql.includes("alter table public.listing_photos enable row level security"));
  const read = policy("listing_photos_select");
  assert.match(read, /for select to anon, authenticated/);
  assert.match(read, /using \(public\.is_listing_public\(listing_id\) or public\.is_listing_member\(listing_id\)\)/);
  const write = policy("listing_photos_write");
  assert.match(write, /for all to authenticated/);
  assert.match(write, /using \(public\.is_listing_owner\(listing_id\)\) with check \(public\.is_listing_owner\(listing_id\)\)/);
});

test("the listing-photos bucket is private, JPEG only and size-capped", () => {
  assert.match(sql, /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\) values \('listing-photos', 'listing-photos', false, \d+, array\['image\/jpeg'\]\)/);
  assert.equal(/'listing-photos', 'listing-photos', true/.test(sql), false);
});

test("listing-photos storage policies: only the owner writes; viewers read published listings only", () => {
  const owner = "public.is_listing_owner(public.listing_id_from_path(name))";
  const read = policy("listing_photo_files_read");
  assert.match(read, /^storage\.objects for select to anon, authenticated/);
  assert.ok(read.includes("bucket_id = 'listing-photos'"));
  assert.ok(read.includes("public.is_listing_public(public.listing_id_from_path(name))"));
  assert.ok(read.includes("public.is_listing_member(public.listing_id_from_path(name))"));
  for (const [name, verb] of [["listing_photo_files_insert", "insert"], ["listing_photo_files_update", "update"], ["listing_photo_files_delete", "delete"]]) {
    const body = policy(name);
    assert.match(body, new RegExp(`^storage\\.objects for ${verb} to authenticated`), name);
    assert.equal(body.includes("anon"), false, `${name} must not allow signed-out writes`);
    assert.ok(body.includes("bucket_id = 'listing-photos'"), name);
    assert.ok(body.includes(owner), `${name} must check the listing's owner`);
  }
  // Every policy in this file is scoped to the new bucket or the new table
  const all = [...sql.matchAll(/create policy ([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(all.sort(), ["listing_photo_files_delete", "listing_photo_files_insert", "listing_photo_files_read", "listing_photo_files_update", "listing_photos_select", "listing_photos_write"]);
});
