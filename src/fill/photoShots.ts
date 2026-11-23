/**
 * The guided photo shot list for photo listings (pure; browser + server).
 * Four required shots of the room for rent, four optional shared spaces, and
 * free extras up to MAX_PHOTOS. Hosts stand still for every shot: no copy here
 * may tell them to walk or step (photoShots.test.ts enforces it).
 */

export const PHOTO_SLOTS = ['doorway', 'center', 'corner', 'storage', 'kitchen', 'bathroom', 'living', 'building', 'other'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export type PhotoShot = { slot: PhotoSlot; name: string; instruction: string; required: boolean };

export const PHOTO_SHOTS: readonly PhotoShot[] = [
  { slot: 'doorway', name: 'Doorway', instruction: 'Stand in the doorway and capture the whole room.', required: true },
  { slot: 'center', name: 'Center', instruction: 'Stand in the middle of the room, facing the window.', required: true },
  { slot: 'corner', name: 'Corner angle', instruction: 'Stand in the far corner and aim diagonally across the room.', required: true },
  { slot: 'storage', name: 'Storage', instruction: 'Closet or storage, doors open.', required: true },
  { slot: 'kitchen', name: 'Kitchen', instruction: 'Stand in the kitchen doorway and capture the counters and stove.', required: false },
  { slot: 'bathroom', name: 'Bathroom', instruction: 'Stand in the bathroom doorway, lights on.', required: false },
  { slot: 'living', name: 'Living room', instruction: 'Stand in a corner of the living room and capture the seating.', required: false },
  { slot: 'building', name: 'Building or view', instruction: 'The building entrance, or the view from the window.', required: false },
];

/** Shown once, before the first shot. */
export const PHOTO_TIPS: readonly string[] = [
  'Turn on all the lights and open the blinds.',
  'Hold your phone sideways at chest height.',
  'Use the 0.5x wide lens if you have one.',
  'Tidy up and put away personal items, like mail and photos of people.',
];

const REQUIRED = PHOTO_SHOTS.filter((s) => s.required).map((s) => s.slot);
export const MIN_PHOTOS = REQUIRED.length;
export const MAX_PHOTOS = 12;

export function isPhotoSlot(value: unknown): value is PhotoSlot {
  return typeof value === 'string' && (PHOTO_SLOTS as readonly string[]).includes(value);
}

export function isRequiredSlot(slot: PhotoSlot): boolean {
  return REQUIRED.includes(slot);
}

export function missingRequiredSlots(slots: readonly PhotoSlot[]): PhotoSlot[] {
  return REQUIRED.filter((slot) => !slots.includes(slot));
}

export function canAddPhoto(count: number): boolean {
  return count < MAX_PHOTOS;
}

/** Every required shot is there, and no more than MAX_PHOTOS in all. */
export function canProceedWithPhotos(slots: readonly PhotoSlot[]): boolean {
  return missingRequiredSlots(slots).length === 0 && slots.length <= MAX_PHOTOS;
}

export function photoProgressText(slots: readonly PhotoSlot[]): string {
  const missing = missingRequiredSlots(slots).length;
  if (missing > 0) return `${MIN_PHOTOS - missing} of ${MIN_PHOTOS} required`;
  return `${slots.length} photos, up to ${MAX_PHOTOS}`;
}

/** The link-preview cover: the doorway photo, else the center photo, else the first one. */
export function coverSlot(slots: readonly PhotoSlot[]): PhotoSlot | null {
  if (slots.includes('doorway')) return 'doorway';
  if (slots.includes('center')) return 'center';
  return slots[0] ?? null;
}

/** Storage path "<listing_id>/<slot>-<key>.jpg" (the bucket's policies read the listing id from it). */
export function photoPath(listingId: string, slot: PhotoSlot, key: string): string {
  return `${listingId}/${slot}-${key.replace(/[^a-z0-9]/gi, '').slice(0, 16)}.jpg`;
}

export function slotFromPhotoPath(path: string): PhotoSlot | null {
  const match = /^[^/]+\/([a-z]+)-[a-z0-9]+\.jpg$/i.exec(path);
  return match && isPhotoSlot(match[1]) ? match[1] : null;
}
