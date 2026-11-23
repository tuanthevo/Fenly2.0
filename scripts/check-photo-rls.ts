/**
 * Live check of row-level security on photo listings (migration 0008).
 *
 *   npx tsx scripts/check-photo-rls.ts
 *
 * Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in
 * .env.local, and migration 0008_photo_listings.sql already run. It creates two
 * throwaway accounts and one draft listing, tries what a stranger and a
 * signed-out visitor must NOT be able to do, then deletes everything it made.
 * Run it against a test project if you have one; it never touches existing rows.
 *
 * The unit tests (server/photoMigration.test.ts) only read the SQL. This is the
 * check that the policies behave that way in a real database.
 */
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishable || !secret) {
  console.error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(2);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, noSession);
const anon = createClient(url, publishable, noSession);

// The smallest valid JPEG (1x1 px): enough for Storage, nothing personal in it
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64"
);

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
};

async function makeUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `rls-check-${label}-${randomBytes(6).toString("hex")}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`create user: ${created.error?.message}`);
  const client = createClient(url!, publishable!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);
  return { id: created.data.user.id, client };
}

async function main() {
  const made: { users: string[]; listing: string | null; paths: string[] } = { users: [], listing: null, paths: [] };
  try {
    const owner = await makeUser("owner");
    made.users.push(owner.id);
    const stranger = await makeUser("stranger");
    made.users.push(stranger.id);

    const listing = await owner.client
      .from("listings")
      .insert({ owner_id: owner.id, rent_cents: 145000, move_out_date: "2030-01-01", available_from: "2030-01-01", media_type: "photos" })
      .select("id, media_type")
      .single();
    if (listing.error) throw new Error(`create draft listing (is migration 0008 run?): ${listing.error.message}`);
    const id: string = listing.data.id;
    made.listing = id;
    check("a draft can be a photo listing (listings.media_type)", listing.data.media_type === "photos");

    const path = `${id}/doorway-rlscheck.jpg`;
    const row = { listing_id: id, slot: "doorway", position: 0, storage_path: path, width: 1, height: 1 };

    // The owner
    const up = await owner.client.storage.from("listing-photos").upload(path, JPEG, { contentType: "image/jpeg", upsert: true });
    check("the owner can upload a photo to their listing", !up.error, up.error?.message);
    if (!up.error) made.paths.push(path);
    const ins = await owner.client.from("listing_photos").insert(row);
    check("the owner can save the photo row", !ins.error, ins.error?.message);
    const ownRead = await owner.client.storage.from("listing-photos").download(path);
    check("the owner can read their draft's photo", !ownRead.error, ownRead.error?.message);

    // A stranger (signed in, not a member of the listing)
    const sRead = await stranger.client.storage.from("listing-photos").download(path);
    check("a stranger cannot read a draft's photo file", Boolean(sRead.error));
    const sRows = await stranger.client.from("listing_photos").select("id").eq("listing_id", id);
    check("a stranger cannot read a draft's photo rows", !sRows.error && (sRows.data ?? []).length === 0);
    const sPath = `${id}/other-stranger.jpg`;
    const sUp = await stranger.client.storage.from("listing-photos").upload(sPath, JPEG, { contentType: "image/jpeg" });
    check("a stranger cannot upload into someone else's listing", Boolean(sUp.error));
    if (!sUp.error) made.paths.push(sPath);
    const sIns = await stranger.client.from("listing_photos").insert({ ...row, storage_path: sPath });
    check("a stranger cannot add a photo row to someone else's listing", Boolean(sIns.error));
    const sDel = await stranger.client.storage.from("listing-photos").remove([path]);
    const stillThere = await owner.client.storage.from("listing-photos").download(path);
    check("a stranger cannot delete someone else's photo", !stillThere.error, sDel.error?.message);
    const sUpd = await stranger.client.from("listing_photos").update({ caption: "changed" }).eq("listing_id", id).select("id");
    check("a stranger cannot change someone else's captions", (sUpd.data ?? []).length === 0);

    // Signed out
    const aRead = await anon.storage.from("listing-photos").download(path);
    check("a signed-out visitor cannot read a draft's photo file", Boolean(aRead.error));
    const aRows = await anon.from("listing_photos").select("id").eq("listing_id", id);
    check("a signed-out visitor cannot read a draft's photo rows", (aRows.data ?? []).length === 0);
    const aUp = await anon.storage.from("listing-photos").upload(`${id}/other-anon.jpg`, JPEG, { contentType: "image/jpeg" });
    check("a signed-out visitor cannot upload", Boolean(aUp.error));
    if (!aUp.error) made.paths.push(`${id}/other-anon.jpg`);

    // The bucket itself
    const bucket = await admin.storage.getBucket("listing-photos");
    check("the listing-photos bucket is private", bucket.data?.public === false, bucket.error?.message);
    const notJpeg = await owner.client.storage.from("listing-photos").upload(`${id}/other-png.png`, Buffer.from("not a jpeg"), { contentType: "image/png" });
    check("the bucket refuses files that are not JPEG", Boolean(notJpeg.error));
    if (!notJpeg.error) made.paths.push(`${id}/other-png.png`);

    // Deleting the listing removes its photo rows (files are removed by server/listingFiles.ts)
    await admin.storage.from("listing-photos").remove(made.paths.splice(0));
    await admin.from("listings").delete().eq("id", id);
    made.listing = null;
    const after = await admin.from("listing_photos").select("id").eq("listing_id", id);
    check("deleting a listing deletes its photo rows", !after.error && (after.data ?? []).length === 0, after.error?.message);
  } finally {
    if (made.paths.length) await admin.storage.from("listing-photos").remove(made.paths);
    if (made.listing) await admin.from("listings").delete().eq("id", made.listing);
    for (const id of made.users) await admin.auth.admin.deleteUser(id);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} of ${results.length} checks FAILED.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Could not finish the check:", error instanceof Error ? error.message : error);
  process.exit(2);
});
