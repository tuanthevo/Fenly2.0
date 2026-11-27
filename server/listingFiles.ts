/**
 * Removing a listing's files from Storage, for delete requests (CCPA).
 *
 * Deleting a listing row (or its owner, which cascades to their listings)
 * removes listing_media and listing_photos rows, but a database cascade does
 * not reach Storage. Call these BEFORE deleting the rows, while the paths can
 * still be read. Service-role client only (server side).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type MediaFile = { bucket: string; path: string };
type PhotoFile = { storage_path: string };

export function filesByBucket(media: MediaFile[], photos: PhotoFile[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (bucket: string, path: string) => {
    if (!path) return;
    out[bucket] ??= [];
    if (!out[bucket].includes(path)) out[bucket].push(path);
  };
  for (const m of media) add(m.bucket, m.path);
  for (const p of photos) add("listing-photos", p.storage_path);
  return out;
}

/** Deletes the listing's videos, raw clips, cover and photos. Returns the number of files removed. */
export async function removeListingFiles(admin: SupabaseClient, listingId: string): Promise<number> {
  const [media, photos] = await Promise.all([
    admin.from("listing_media").select("bucket, path").eq("listing_id", listingId),
    admin.from("listing_photos").select("storage_path").eq("listing_id", listingId),
  ]);
  if (media.error) throw new Error(`load media: ${media.error.message}`);
  // listing_photos is missing until migration 0008 is run: then there are no photos to remove
  const groups = filesByBucket((media.data ?? []) as MediaFile[], photos.error ? [] : ((photos.data ?? []) as PhotoFile[]));
  let removed = 0;
  for (const [bucket, paths] of Object.entries(groups)) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw new Error(`remove ${bucket}: ${error.message}`);
    removed += paths.length;
  }
  return removed;
}

/** Every listing the user owns. Run before deleting the user (auth.users delete cascades the rows). */
export async function removeUserListingFiles(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin.from("listings").select("id").eq("owner_id", userId);
  if (error) throw new Error(`load listings: ${error.message}`);
  let removed = 0;
  for (const listing of data ?? []) removed += await removeListingFiles(admin, listing.id);
  return removed;
}
