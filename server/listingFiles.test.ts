import test from "node:test";
import assert from "node:assert/strict";
import { filesByBucket, removeListingFiles } from "./listingFiles";

test("filesByBucket groups a listing's videos, covers, raw clips and photos by bucket", () => {
  assert.deepEqual(
    filesByBucket(
      [
        { bucket: "listing-videos", path: "L/full.mp4" },
        { bucket: "listing-videos", path: "L/raw/slot-1.mov" },
        { bucket: "listing-thumbnails", path: "L/thumb.jpg" },
        { bucket: "listing-videos", path: "L/full.mp4" },
      ],
      [{ storage_path: "L/doorway-a1.jpg" }, { storage_path: "L/center-b2.jpg" }]
    ),
    {
      "listing-videos": ["L/full.mp4", "L/raw/slot-1.mov"],
      "listing-thumbnails": ["L/thumb.jpg"],
      "listing-photos": ["L/doorway-a1.jpg", "L/center-b2.jpg"],
    }
  );
  assert.deepEqual(filesByBucket([], []), {});
});

test("removeListingFiles deletes every file of the listing and reports how many", async () => {
  const removed: Record<string, string[]> = {};
  const table = (rows: unknown[]) => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) });
  const admin = {
    from: (name: string) =>
      name === "listing_media"
        ? table([{ bucket: "listing-videos", path: "L/full.mp4" }, { bucket: "listing-thumbnails", path: "L/thumb.jpg" }])
        : table([{ storage_path: "L/doorway-a1.jpg" }]),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed[bucket] = paths;
          return { data: paths, error: null };
        },
      }),
    },
  };
  const count = await removeListingFiles(admin as never, "L");
  assert.equal(count, 3);
  assert.deepEqual(removed, { "listing-videos": ["L/full.mp4"], "listing-thumbnails": ["L/thumb.jpg"], "listing-photos": ["L/doorway-a1.jpg"] });
});
