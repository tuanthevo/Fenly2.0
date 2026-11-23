/**
 * Turns a feed listing's photos into a photo-tour plan (src/remotion/viral/photoTour.ts):
 * the demo listings' stills become "walking into the home" videos in the feed.
 * Pure, so it is unit tested.
 */
import type { RoomListing } from '../types';
import { formatMoveIn } from '../fill/publicListing';
import { PHOTO_SHOTS, type PhotoSlot } from '../fill/photoShots';
import {
  buildPhotoTourPlan,
  closerTagFromLabel,
  tagsFromLabel,
  type PhotoTourPhoto,
} from '../remotion/viral/photoTour';
import type { ViralEditPlan, ViralListingInfo, ViralStyleId } from '../remotion/viral/types';

export type TourPhotoScene = { label: string; imageUrl: string };

/** Listings rotate through the three hook styles so the feed doesn't repeat one format. */
export const PHOTO_TOUR_STYLES: ViralStyleId[] = ['price-hook', 'pov', 'guess-rent'];

const ROOM_FACT: Record<string, string> = {
  'Private Room': 'Private room',
  'Master Suite': 'Primary suite',
  'Studio Sublet': 'Studio',
  'Shared Room': 'Shared room',
  'Entire Place': 'Entire place',
};

export function listingInfoForRoom(room: RoomListing): ViralListingInfo {
  return {
    monthlyRent: room.price,
    beds: room.roomType === 'Studio Sublet' ? 'Studio' : 1,
    baths: 1,
    neighborhood: room.neighborhood,
    city: room.city,
    roomType: room.roomType,
    squareFeet: room.squareFeet,
    amenities: room.amenities ?? [],
    leaseTerm: room.leaseTerm,
  };
}

/** A stable number per listing ("room-7" -> 6), used to pick the style and camera moves. */
export function listingVariant(roomId: string): number {
  const n = /(\d+)\s*$/.exec(roomId);
  if (n) return Math.max(0, Number(n[1]) - 1);
  let h = 0;
  for (const ch of roomId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function factsForRoom(room: RoomListing): string[] {
  const facts = [ROOM_FACT[room.roomType] ?? 'Private room'];
  if (room.squareFeet > 0) facts.push(`${Math.round(room.squareFeet)} sq ft`);
  const date = (room.availableDate || '').trim();
  if (/^(now|immediately|asap)$/i.test(date)) facts.push('Available now');
  else if (date && date.length <= 12) facts.push(`Available ${date}`);
  return facts.slice(0, 3);
}

export function photoTourPlanForRoom(room: RoomListing, scenes: TourPhotoScene[]): ViralEditPlan | null {
  const usable = scenes.filter((s) => Boolean(s.imageUrl));
  if (usable.length < 2) return null;
  const photos: PhotoTourPhoto[] = usable.map((s, i) =>
    i === usable.length - 1 ? { src: s.imageUrl, tag: closerTagFromLabel(s.label) } : { src: s.imageUrl, ...tagsFromLabel(s.label) }
  );
  const variant = listingVariant(room.id);
  return buildPhotoTourPlan(
    { listing: listingInfoForRoom(room), photos, facts: factsForRoom(room) },
    { style: PHOTO_TOUR_STYLES[variant % PHOTO_TOUR_STYLES.length], variant }
  );
}

/* ---------- host photo listings (Fill > Take photos) ---------- */

export type ListingTourPhoto = {
  src: string;
  slot: PhotoSlot;
  /** The approved caption: "Room label" or "Room label, second callout" */
  caption?: string | null;
  landscape?: boolean;
};

export type ListingTourOptions = {
  /** YYYY-MM-DD */
  availableFrom?: string | null;
  today?: string;
  /** Picks the pan order, so two listings don't move the same way */
  listingId: string;
  hookText?: string;
};

const shotName = (slot: PhotoSlot) => PHOTO_SHOTS.find((s) => s.slot === slot)?.name ?? 'Room';

/** "South-facing window, Built-in closet" -> the room label and its second callout. */
export function calloutsFromCaption(caption: string | null | undefined, slot: PhotoSlot): { tag: string; detail: string } {
  const [first = '', ...rest] = (caption ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  return { tag: first || shotName(slot), detail: rest.join(', ') };
}

/**
 * The host's own photos as a calm tour: the approved one-way pans, crossfades,
 * no sound effects. The opener carries the price and the area; the facts that
 * follow add the move-in date. Photos play in the order given.
 */
export function photoTourPlanForListing(
  listing: ViralListingInfo,
  photos: ListingTourPhoto[],
  options: ListingTourOptions
): ViralEditPlan | null {
  const usable = photos.filter((p) => Boolean(p.src));
  if (usable.length < 2) return null;
  const facts = [ROOM_FACT[listing.roomType ?? ''] ?? 'Private room'];
  if (listing.squareFeet && listing.squareFeet > 0) facts.push(`${Math.round(listing.squareFeet)} sq ft`);
  const moveIn = formatMoveIn(options.availableFrom, options.today);
  if (moveIn) facts.push(moveIn === 'now' ? 'Available now' : `Available ${moveIn}`);
  return buildPhotoTourPlan(
    {
      listing,
      photos: usable.map((p) => ({ src: p.src, landscape: p.landscape, ...calloutsFromCaption(p.caption, p.slot) })),
      facts,
    },
    { style: 'price-hook', variant: listingVariant(options.listingId), calm: true, sfx: false, hookText: options.hookText }
  );
}
