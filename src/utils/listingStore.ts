/**
 * Keeps listings the host publishes on this device (IndexedDB), so they and
 * their videos survive a page reload or a server restart.
 *
 * Listings point at their media with `blob:` URLs that die on reload. Before a
 * listing is saved, every `blob:` URL inside it is swapped for a token
 * (`fenly-media:<id>`) and the media itself is stored as a Blob. On load the
 * tokens become fresh `blob:` URLs again.
 *
 * Stopgap until listings and media live in Supabase: storage is per browser,
 * per device, and the browser can clear it under storage pressure.
 */
import type { RoomListing } from '../types';

export const MEDIA_TOKEN_PREFIX = 'fenly-media:';
export const HOST_LISTING_ID_PREFIX = 'room-custom-';

const DB_NAME = 'fenly-listings';
const DB_VERSION = 1;
const LISTINGS = 'listings';
const MEDIA = 'media';

// ---------- Pure helpers (unit tested) ----------

/** Returns a deep copy of `value` with every string passed through `swap`. */
export function mapStrings<T>(value: T, swap: (s: string) => string): T {
  if (typeof value === 'string') return swap(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, swap)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v, swap);
    return out as T;
  }
  return value;
}

/** Every distinct string inside `value` that passes `match`. */
export function collectStrings(value: unknown, match: (s: string) => boolean): string[] {
  const found = new Set<string>();
  mapStrings(value, (s) => {
    if (match(s)) found.add(s);
    return s;
  });
  return [...found];
}

export const isBlobUrl = (s: string) => s.startsWith('blob:');
export const isMediaToken = (s: string) => s.startsWith(MEDIA_TOKEN_PREFIX);
export const isHostListing = (room: Pick<RoomListing, 'id'>) => room.id.startsWith(HOST_LISTING_ID_PREFIX);

/** Puts saved host listings first (newest first), then the built-in ones without duplicates. */
export function mergeSavedListings(saved: RoomListing[], builtIn: RoomListing[]): RoomListing[] {
  const ids = new Set(saved.map((r) => r.id));
  return [...saved, ...builtIn.filter((r) => !ids.has(r.id))];
}

// ---------- IndexedDB ----------

type SavedListing = { id: string; savedAt: number; order: number; room: RoomListing };
type SavedMedia = { id: string; blob: Blob };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LISTINGS)) db.createObjectStore(LISTINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function getOne<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

// blob: URL <-> media id, for this page session
const tokenByBlobUrl = new Map<string, string>();
const blobUrlByToken = new Map<string, string>();

function newMediaId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${MEDIA_TOKEN_PREFIX}${random}`;
}

/** Loads saved host listings (newest first) with live blob: URLs for their media. */
export async function loadSavedListings(): Promise<RoomListing[]> {
  const db = await openDb();
  const rows = await getAll<SavedListing>(db, LISTINGS);
  rows.sort((a, b) => a.order - b.order);
  const rooms: RoomListing[] = [];
  for (const row of rows) {
    for (const token of collectStrings(row.room, isMediaToken)) {
      if (blobUrlByToken.has(token)) continue;
      const media = await getOne<SavedMedia>(db, MEDIA, token);
      if (!media) continue;
      const url = URL.createObjectURL(media.blob);
      blobUrlByToken.set(token, url);
      tokenByBlobUrl.set(url, token);
    }
    // Media that went missing becomes an empty string, so the player falls back to images
    rooms.push(mapStrings(row.room, (s) => (isMediaToken(s) ? blobUrlByToken.get(s) ?? '' : s)));
  }
  return rooms;
}

/**
 * Makes the saved set match `hostRooms` (in feed order): stores new media,
 * writes every listing, and deletes listings and media that are gone.
 */
export async function syncSavedListings(hostRooms: RoomListing[]): Promise<void> {
  const db = await openDb();

  // 1. Store any media not saved yet (read the blobs before opening the write transaction)
  const newMedia: SavedMedia[] = [];
  for (const url of collectStrings(hostRooms, isBlobUrl)) {
    if (tokenByBlobUrl.has(url)) continue;
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const id = newMediaId();
      newMedia.push({ id, blob });
      tokenByBlobUrl.set(url, id);
      blobUrlByToken.set(id, url);
    } catch {
      // The URL was already revoked; that piece of media can't be kept
    }
  }

  const rows: SavedListing[] = hostRooms.map((room, order) => ({
    id: room.id,
    savedAt: Date.now(),
    order,
    room: mapStrings(room, (s) => (isBlobUrl(s) ? tokenByBlobUrl.get(s) ?? '' : s)),
  }));
  const keepListing = new Set(rows.map((r) => r.id));
  const keepMedia = new Set(collectStrings(rows, isMediaToken));

  const existingListings = await getAll<SavedListing>(db, LISTINGS);
  const existingMediaIds = (await getAll<SavedMedia>(db, MEDIA)).map((m) => m.id);

  const tx = db.transaction([LISTINGS, MEDIA], 'readwrite');
  const listingStore = tx.objectStore(LISTINGS);
  const mediaStore = tx.objectStore(MEDIA);
  for (const media of newMedia) if (keepMedia.has(media.id)) mediaStore.put(media);
  for (const row of rows) listingStore.put(row);
  for (const old of existingListings) if (!keepListing.has(old.id)) listingStore.delete(old.id);
  for (const id of existingMediaIds) if (!keepMedia.has(id)) mediaStore.delete(id);
  await done(tx);
}
